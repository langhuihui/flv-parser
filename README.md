# FLV Parser

一个基于Web的FLV文件解析器，可以分析FLV文件的帧信息。

## 功能特点

- 支持拖放文件上传
- 显示文件基本信息（文件名、大小）
- 分析并显示每一帧的详细信息：
  - 时间戳
  - 帧类型（音频/视频/脚本）
  - 帧大小
  - 对于视频序列帧，显示SPS和PPS等详细信息
- 使用不同颜色标注不同类型的帧
- 完全在浏览器端运行，无需服务器

## 使用方法

1. 直接在浏览器中打开 `index.html` 文件
2. 将FLV文件拖放到指定区域，或点击选择文件
3. 等待解析完成后，查看分析结果

## 帧类型说明

- 蓝色：脚本数据
- 橙色：视频帧
- 绿色：音频帧
- 紫色：序列帧（包含SPS/PPS信息）

## 技术说明

- 使用原生JavaScript实现
- 使用HTML5 File API读取文件
- 使用DataView进行二进制数据解析
- 支持现代浏览器（Chrome、Firefox、Safari、Edge）

## 注意事项

- 仅支持标准FLV格式文件
- 文件解析在浏览器端进行，大文件可能需要较长时间
- 建议使用现代浏览器以获得最佳体验 