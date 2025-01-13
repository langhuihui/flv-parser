class FLVParser {
  constructor() {
    this.offset = 0;
    this.frames = [];
    this.error = null;
    this.data = null;
    this.onProgress = null;
    this.keyframePositions = [];
    this.isPaused = false;
    this.videoInfo = {
      width: 0,
      height: 0,
      profile: '',
      level: 0
    };
  }

  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  async parse(arrayBuffer) {
    this.data = new DataView(arrayBuffer);
    this.frames = [];
    this.error = null;
    this.offset = 0;

    try {
      // Check FLV signature
      const signature = String.fromCharCode(this.data.getUint8(0), this.data.getUint8(1), this.data.getUint8(2));
      if (signature !== 'FLV') {
        throw new Error('无效的FLV文件签名');
      }

      // Parse header
      const version = this.data.getUint8(3);
      const flags = this.data.getUint8(4);
      const headerSize = this.data.getUint32(5);

      this.offset = headerSize;

      // Start async parsing
      await this.parseNextTag();
    } catch (e) {
      this.error = {
        message: e.message,
        offset: this.offset,
        parsedFrames: this.frames.length
      };
    }

    return {
      frames: this.frames,
      error: this.error
    };
  }

  async parseNextTag() {
    if (this.offset >= this.data.byteLength - 4) {
      return;
    }

    try {
      const previousTagSize = this.data.getUint32(this.offset);
      this.offset += 4;

      if (this.offset >= this.data.byteLength) return;

      const tagInfo = this.parseTag(this.data);
      if (tagInfo) {
        this.frames.push(tagInfo);
        if (this.onProgress) {
          this.onProgress({
            frames: this.frames,
            currentFrame: tagInfo,
            progress: (this.offset / this.data.byteLength) * 100,
            hasKeyframePositions: this.keyframePositions.length > 0
          });
        }
      }

      // Schedule next tag parsing
      if (!this.isPaused) {
        await new Promise(resolve => setTimeout(resolve, 0)); // 让出主线程
        await this.parseNextTag();
      }
    } catch (e) {
      this.error = {
        message: e.message,
        offset: this.offset,
        parsedFrames: this.frames.length
      };
    }
  }

  parseTag(data) {
    if (this.offset + 11 > data.byteLength) {
      throw new Error('标签头部数据不完整');
    }

    const tagType = data.getUint8(this.offset);
    if (tagType !== 8 && tagType !== 9 && tagType !== 18) {
      throw new Error(`无效的标签类型: ${tagType}`);
    }

    const dataSize = (data.getUint8(this.offset + 1) << 16) |
      (data.getUint8(this.offset + 2) << 8) |
      (data.getUint8(this.offset + 3));

    if (this.offset + 11 + dataSize > data.byteLength) {
      throw new Error('标签数据不完整');
    }

    const timestamp = (data.getUint8(this.offset + 7) << 24) |
      (data.getUint8(this.offset + 4) << 16) |
      (data.getUint8(this.offset + 5) << 8) |
      (data.getUint8(this.offset + 6));

    const tagHeader = 11;
    let details = '';
    let isKeyframe = false;
    let isSequenceHeader = false;
    const filePosition = this.offset;

    if (tagType === 9 && dataSize > 0) { // Video
      try {
        const frameType = (data.getUint8(this.offset + tagHeader) >> 4) & 0x0F;
        const codecID = data.getUint8(this.offset + tagHeader) & 0x0F;

        isKeyframe = frameType === 1;
        details = `帧类型: ${this.getFrameType(frameType)}, 编码: ${this.getCodecName(codecID)}\n`;

        if (codecID === 7) { // AVC
          const avcPacketType = data.getUint8(this.offset + tagHeader + 1);
          if (avcPacketType === 0) { // AVC sequence header
            const avcInfo = this.parseAVCDecoderConfigurationRecord(data, this.offset + tagHeader + 2);
            details = '序列头帧\n' + details + avcInfo.details;
            Object.assign(this.videoInfo, avcInfo.videoInfo);
            isSequenceHeader = true;
          }
        }
      } catch (e) {
        details = `解析视频数据时出错: ${e.message}`;
      }
    } else if (tagType === 18 && dataSize > 0) { // Script Data Tag (onMetaData)
      try {
        const scriptData = this.parseScriptData(data, this.offset + tagHeader, dataSize);
        details = scriptData;
      } catch (e) {
        details = `解析Script数据时出错: ${e.message}`;
      }
    }

    const frame = {
      type: this.getTagType(tagType),
      timestamp,
      size: dataSize,
      details,
      isKeyframe,
      isSequenceHeader,
      filePosition,
      blockSize: 40
    };

    this.offset += tagHeader + dataSize;
    return frame;
  }

  parseScriptData(data, offset, length) {
    let currentOffset = offset;
    const endOffset = offset + length;
    let result = '';
    let keyframes = null;
    let filepositions = [];
    let times = [];

    try {
      // Type of SCRIPTDATAVALUE (should be 2 for string)
      const typeId = data.getUint8(currentOffset++);
      if (typeId !== 2) {
        return 'Invalid script data type';
      }

      // Read string length (UI16)
      const strLen = (data.getUint8(currentOffset) << 8) | data.getUint8(currentOffset + 1);
      currentOffset += 2;

      // Read string
      let scriptName = '';
      for (let i = 0; i < strLen; i++) {
        scriptName += String.fromCharCode(data.getUint8(currentOffset + i));
      }
      currentOffset += strLen;

      if (scriptName === 'onMetaData') {
        // Read array type (should be 8 for ECMA array)
        const arrayType = data.getUint8(currentOffset++);
        if (arrayType === 8) {
          // Read array length (UI32)
          const arrayLength = data.getUint32(currentOffset);
          currentOffset += 4;

          result = 'onMetaData:\n';

          // Parse array elements
          while (currentOffset < endOffset - 3) { // -3 for end marker
            // Read property name length (UI16)
            const nameLen = (data.getUint8(currentOffset) << 8) | data.getUint8(currentOffset + 1);
            currentOffset += 2;

            // Read property name
            let propertyName = '';
            for (let i = 0; i < nameLen; i++) {
              propertyName += String.fromCharCode(data.getUint8(currentOffset + i));
            }
            currentOffset += nameLen;

            // Read property type
            const valueType = data.getUint8(currentOffset++);
            let value;

            // Parse value based on type
            switch (valueType) {
              case 0: // Number type
                value = new DataView(data.buffer, currentOffset, 8).getFloat64(0);
                currentOffset += 8;
                break;
              case 1: // Boolean type
                value = data.getUint8(currentOffset++) !== 0;
                break;
              case 2: // String type
                const valueLen = (data.getUint8(currentOffset) << 8) | data.getUint8(currentOffset + 1);
                currentOffset += 2;
                value = '';
                for (let i = 0; i < valueLen; i++) {
                  value += String.fromCharCode(data.getUint8(currentOffset + i));
                }
                currentOffset += valueLen;
                break;
              case 3: // Object type
                value = {};
                while (currentOffset < endOffset - 3) {
                  const objNameLen = (data.getUint8(currentOffset) << 8) | data.getUint8(currentOffset + 1);
                  if (objNameLen === 0) {
                    currentOffset += 3; // Skip end marker (0x000009)
                    break;
                  }
                  currentOffset += 2;

                  let objName = '';
                  for (let i = 0; i < objNameLen; i++) {
                    objName += String.fromCharCode(data.getUint8(currentOffset + i));
                  }
                  currentOffset += objNameLen;

                  const objValueType = data.getUint8(currentOffset++);
                  let objValue;

                  switch (objValueType) {
                    case 0: // Number type
                      objValue = new DataView(data.buffer, currentOffset, 8).getFloat64(0);
                      currentOffset += 8;
                      break;
                    case 1: // Boolean type
                      objValue = data.getUint8(currentOffset++) !== 0;
                      break;
                    case 2: // String type
                      const objStrLen = (data.getUint8(currentOffset) << 8) | data.getUint8(currentOffset + 1);
                      currentOffset += 2;
                      objValue = '';
                      for (let i = 0; i < objStrLen; i++) {
                        objValue += String.fromCharCode(data.getUint8(currentOffset + i));
                      }
                      currentOffset += objStrLen;
                      break;
                    case 10: // Array type
                      const arrayLen = data.getUint32(currentOffset);
                      currentOffset += 4;
                      objValue = [];
                      for (let i = 0; i < arrayLen; i++) {
                        const elemType = data.getUint8(currentOffset++);
                        if (elemType === 0) { // Number type
                          const elemValue = new DataView(data.buffer, currentOffset, 8).getFloat64(0);
                          objValue.push(elemValue);
                          currentOffset += 8;
                        }
                      }
                      break;
                  }

                  value[objName] = objValue;
                }
                break;
              case 10: // Strict array type
                const arrayLen = data.getUint32(currentOffset);
                currentOffset += 4;
                value = [];

                // Parse array elements
                for (let i = 0; i < arrayLen; i++) {
                  const elemType = data.getUint8(currentOffset++);
                  switch (elemType) {
                    case 0: // Number type
                      const elemValue = new DataView(data.buffer, currentOffset, 8).getFloat64(0);
                      value.push(elemValue);
                      currentOffset += 8;
                      break;
                    case 1: // Boolean type
                      value.push(data.getUint8(currentOffset++) !== 0);
                      break;
                    case 2: // String type
                      const strLen = (data.getUint8(currentOffset) << 8) | data.getUint8(currentOffset + 1);
                      currentOffset += 2;
                      let str = '';
                      for (let j = 0; j < strLen; j++) {
                        str += String.fromCharCode(data.getUint8(currentOffset + j));
                      }
                      value.push(str);
                      currentOffset += strLen;
                      break;
                    default:
                      console.warn(`Unknown array element type: ${elemType}`);
                      value.push(null);
                      break;
                  }
                }
                break;
              default:
                value = `[Type: ${valueType}]`;
                // Skip unknown types
                currentOffset = endOffset;
            }

            // Store keyframes data
            if (propertyName === 'keyframes') {
              keyframes = value;
              console.log('Found keyframes object:', keyframes);
              if (keyframes && keyframes.filepositions && Array.isArray(keyframes.filepositions)) {
                this.keyframePositions = keyframes.filepositions;
                console.log(`Found ${this.keyframePositions.length} filepositions in keyframes object:`, this.keyframePositions.slice(0, 5));
                if (this.onProgress) {
                  this.onProgress({
                    frames: this.frames,
                    currentFrame: null,
                    progress: (this.offset / this.data.byteLength) * 100,
                    hasKeyframePositions: true
                  });
                }
              }
            } else if (propertyName === 'filepositions') {
              filepositions = value;
              // Validate and update keyframe positions
              if (Array.isArray(value) && value.length > 0) {
                this.keyframePositions = value;
                console.log(`Found ${value.length} filepositions:`, value.slice(0, 5));
                if (this.onProgress) {
                  this.onProgress({
                    frames: this.frames,
                    currentFrame: null,
                    progress: (this.offset / this.data.byteLength) * 100,
                    hasKeyframePositions: true
                  });
                }
              } else {
                console.warn('Invalid filepositions:', value);
              }
            } else if (propertyName === 'times') {
              times = value;
              console.log('Found times array:', times ? times.length : 0);
            }

            result += `  ${propertyName}: ${Array.isArray(value) ? `[${value.join(', ')}]` : value}\n`;
          }
        }
      }
    } catch (e) {
      console.error('Error parsing script data:', e);
      return `解析Script数据失败: ${e.message}`;
    }

    return result;
  }

  getFrameType(type) {
    switch (type) {
      case 1: return '关键帧';
      case 2: return '非关键帧';
      case 3: return '可丢弃帧';
      case 4: return '生成关键帧';
      case 5: return '视频信息/命令帧';
      default: return `未知(${type})`;
    }
  }

  getCodecName(codecID) {
    switch (codecID) {
      case 1: return 'JPEG';
      case 2: return 'H.263';
      case 3: return 'Screen video';
      case 4: return 'VP6';
      case 5: return 'VP6 with alpha';
      case 6: return 'Screen video v2';
      case 7: return 'AVC/H.264';
      default: return `未知(${codecID})`;
    }
  }

  getTagType(type) {
    switch (type) {
      case 8: return 'audio';
      case 9: return 'video';
      case 18: return 'script';
      default: return 'unknown';
    }
  }

  parseAVCDecoderConfigurationRecord(data, offset) {
    const version = data.getUint8(offset);
    const profile = data.getUint8(offset + 1);
    const compatibility = data.getUint8(offset + 2);
    const level = data.getUint8(offset + 3);

    const lengthSizeMinusOne = data.getUint8(offset + 4) & 0x03;
    const numOfSPS = data.getUint8(offset + 5) & 0x1F;

    let currentOffset = offset + 6;
    let details = `Profile: ${this.getAVCProfileName(profile)}, Level: ${level / 10}\n`;
    let videoInfo = {
      profile: this.getAVCProfileName(profile),
      level: level / 10
    };

    // Parse SPS
    for (let i = 0; i < numOfSPS; i++) {
      const spsLength = (data.getUint8(currentOffset) << 8) | data.getUint8(currentOffset + 1);
      currentOffset += 2;

      const spsInfo = this.parseSPS(data, currentOffset, spsLength);
      details += spsInfo.details;
      Object.assign(videoInfo, spsInfo.videoInfo);

      currentOffset += spsLength;
    }

    return { details, videoInfo };
  }

  parseSPS(data, offset, length) {
    // 这里实现H.264 SPS解析
    try {
      const bits = new BitReader(data, offset, length);

      // 跳过固定头部
      bits.skipBits(8); // NAL header

      const profileIdc = bits.readBits(8);
      bits.skipBits(16); // constraint_set_flags and reserved_zero_5bits
      const levelIdc = bits.readBits(8);

      bits.readUEG(); // seq_parameter_set_id

      // 根据profile读取不同的参数
      if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134].includes(profileIdc)) {
        const chromaFormatIdc = bits.readUEG();
        if (chromaFormatIdc === 3) {
          bits.skipBits(1); // separate_colour_plane_flag
        }
        bits.readUEG(); // bit_depth_luma_minus8
        bits.readUEG(); // bit_depth_chroma_minus8
        bits.skipBits(1); // qpprime_y_zero_transform_bypass_flag

        const seqScalingMatrixPresent = bits.readBits(1);
        if (seqScalingMatrixPresent) {
          const chromaFormatIdcTable = chromaFormatIdc !== 3 ? 8 : 12;
          for (let i = 0; i < chromaFormatIdcTable; i++) {
            if (bits.readBits(1)) {
              bits.skipBits(i < 6 ? 16 : 64); // scaling_list
            }
          }
        }
      }

      bits.readUEG(); // log2_max_frame_num_minus4
      const picOrderCntType = bits.readUEG();

      if (picOrderCntType === 0) {
        bits.readUEG(); // log2_max_pic_order_cnt_lsb_minus4
      } else if (picOrderCntType === 1) {
        bits.skipBits(1); // delta_pic_order_always_zero_flag
        bits.readSEG(); // offset_for_non_ref_pic
        bits.readSEG(); // offset_for_top_to_bottom_field
        const numRefFramesInPicOrderCntCycle = bits.readUEG();
        for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
          bits.readSEG(); // offset_for_ref_frame
        }
      }

      bits.readUEG(); // max_num_ref_frames
      bits.skipBits(1); // gaps_in_frame_num_value_allowed_flag

      const picWidthInMbsMinus1 = bits.readUEG();
      const picHeightInMapUnitsMinus1 = bits.readUEG();

      const frameMbsOnlyFlag = bits.readBits(1);
      const mb_adaptive_frame_field_flag = frameMbsOnlyFlag ? 0 : bits.readBits(1);

      const width = (picWidthInMbsMinus1 + 1) * 16;
      const height = (2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16;

      return {
        details: `分辨率: ${width}x${height}\n`,
        videoInfo: { width, height }
      };
    } catch (e) {
      return {
        details: `解析SPS失败: ${e.message}\n`,
        videoInfo: { width: 0, height: 0 }
      };
    }
  }

  getAVCProfileName(profile) {
    const profiles = {
      66: 'Baseline',
      77: 'Main',
      88: 'Extended',
      100: 'High',
      110: 'High 10',
      122: 'High 4:2:2',
      244: 'High 4:4:4',
      44: 'CAVLC 4:4:4'
    };
    return profiles[profile] || `Unknown(${profile})`;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    if (this.data) {
      this.parseNextTag(); // 继续解析
    }
  }
}

class BitReader {
  constructor(data, offset, length) {
    this.data = data;
    this.offset = offset;
    this.length = length;
    this.bitOffset = 0;
    this.currentByte = this.data.getUint8(this.offset);
  }

  readBits(count) {
    let result = 0;
    for (let i = 0; i < count; i++) {
      result = (result << 1) | this.readBit();
    }
    return result;
  }

  readBit() {
    const bit = (this.currentByte >> (7 - this.bitOffset)) & 1;
    this.bitOffset++;
    if (this.bitOffset === 8) {
      this.bitOffset = 0;
      this.offset++;
      if (this.offset < this.length) {
        this.currentByte = this.data.getUint8(this.offset);
      }
    }
    return bit;
  }

  skipBits(count) {
    for (let i = 0; i < count; i++) {
      this.readBit();
    }
  }

  readUEG() {
    let leadingZeros = 0;
    while (this.readBit() === 0 && leadingZeros < 32) {
      leadingZeros++;
    }
    return leadingZeros === 0 ? 0 : ((1 << leadingZeros) | this.readBits(leadingZeros)) - 1;
  }

  readSEG() {
    const value = this.readUEG();
    return (value & 1) ? (value + 1) >> 1 : -(value >> 1);
  }
} 