document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const results = document.getElementById('results');
    const filename = document.getElementById('filename');
    const filesize = document.getElementById('filesize');
    const frameList = document.getElementById('frame-list');
    const errorInfo = document.getElementById('error-info');
    const errorOffset = document.getElementById('error-offset');
    const errorMessage = document.getElementById('error-message');
    const parsedFrames = document.getElementById('parsed-frames');
    const timelineFrames = document.getElementById('timeline-frames');
    const toggleFoldButton = document.getElementById('toggle-fold');
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const videoInfo = document.getElementById('video-info');
    const resolution = document.getElementById('resolution');
    const profile = document.getElementById('profile');
    const level = document.getElementById('level');
    
    const parser = new FLVParser();
    let isFolded = true;
    let frameWidth = 10;
    let currentFrames = [];
    let selectedBlock = null;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when dragging over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFileSelect, false);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight(e) {
        dropZone.classList.add('drag-over');
    }

    function unhighlight(e) {
        dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFile(file);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        handleFile(file);
    }

    // Add timeline controls event listeners
    toggleFoldButton.addEventListener('click', () => {
        isFolded = !isFolded;
        toggleFoldButton.textContent = isFolded ? '展开非关键帧' : '折叠非关键帧';
        updateTimelineView();
        updateTableView();
    });

    zoomInButton.addEventListener('click', () => {
        frameWidth = Math.min(frameWidth * 1.5, 40);
        updateTimelineView();
    });

    zoomOutButton.addEventListener('click', () => {
        frameWidth = Math.max(frameWidth / 1.5, 5);
        updateTimelineView();
    });

    function updateTableView() {
        frameList.innerHTML = '';
        
        if (isFolded) {
            let nonKeyFrameCount = 0;
            let lastKeyFrameIndex = -1;
            let foldedFrames = [];
            
            currentFrames.forEach((frame, index) => {
                if (frame.type === 'video' && frame.isKeyframe) {
                    // Add folded frames if any
                    if (nonKeyFrameCount > 0) {
                        addFoldedTableRow(foldedFrames, lastKeyFrameIndex + 1, index - 1);
                        foldedFrames = [];
                        nonKeyFrameCount = 0;
                    }
                    addTableRow(frame, index);
                    lastKeyFrameIndex = index;
                } else {
                    nonKeyFrameCount++;
                    foldedFrames.push({ frame, index });
                }
            });
            
            // Add remaining folded frames if any
            if (nonKeyFrameCount > 0) {
                addFoldedTableRow(foldedFrames, lastKeyFrameIndex + 1, currentFrames.length - 1);
            }
        } else {
            currentFrames.forEach((frame, index) => {
                addTableRow(frame, index);
            });
        }
    }

    function addTableRow(frame, index) {
        const row = document.createElement('tr');
        row.classList.add(`frame-${frame.type}`);
        row.dataset.index = index;
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${formatTimestamp(frame.timestamp)}</td>
            <td>${frame.type}</td>
            <td>${formatFileSize(frame.size)}</td>
            <td><pre>${frame.details || '-'}</pre></td>
        `;
        
        frameList.appendChild(row);
    }

    function addFoldedTableRow(frames, startIndex, endIndex) {
        const row = document.createElement('tr');
        row.className = 'folded-rows';
        row.dataset.startIndex = startIndex;
        row.dataset.endIndex = endIndex;
        
        const count = endIndex - startIndex + 1;
        row.innerHTML = `
            <td colspan="5">
                已折叠 ${count} 帧 (#${startIndex + 1} - #${endIndex + 1})
            </td>
        `;
        
        row.addEventListener('click', () => {
            isFolded = false;
            toggleFoldButton.textContent = '折叠非关键帧';
            updateTimelineView();
            updateTableView();
            
            // 滚动到第一个展开的帧
            setTimeout(() => {
                const targetRow = frameList.querySelector(`tr[data-index="${startIndex}"]`);
                if (targetRow) {
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    highlightRow(targetRow);
                }
            }, 100);
        });
        
        frameList.appendChild(row);
    }

    function highlightRow(row) {
        // Remove previous highlight
        const highlighted = frameList.querySelector('.table-row-highlight');
        if (highlighted) {
            highlighted.classList.remove('table-row-highlight');
        }
        
        // Add new highlight
        row.classList.add('table-row-highlight');
    }

    function updateTimelineView() {
        timelineFrames.innerHTML = '';
        
        if (isFolded) {
            let nonKeyFrameCount = 0;
            let lastKeyFrameIndex = -1;
            
            currentFrames.forEach((frame, index) => {
                if (frame.type === 'video' && frame.isKeyframe) {
                    if (nonKeyFrameCount > 0) {
                        addFoldedBlock(nonKeyFrameCount, lastKeyFrameIndex + 1, index - 1);
                        nonKeyFrameCount = 0;
                    }
                    addFrameBlock(frame, index);
                    lastKeyFrameIndex = index;
                } else {
                    nonKeyFrameCount++;
                }
            });
            
            if (nonKeyFrameCount > 0) {
                addFoldedBlock(nonKeyFrameCount, lastKeyFrameIndex + 1, currentFrames.length - 1);
            }
        } else {
            currentFrames.forEach((frame, index) => {
                addFrameBlock(frame, index);
            });
        }
    }

    function addFrameBlock(frame, index) {
        const block = document.createElement('div');
        block.className = `frame-block ${frame.type}`;
        if (frame.type === 'video' && frame.isKeyframe) {
            block.classList.add('keyframe');
        }
        block.style.width = `${frameWidth}px`;
        block.dataset.index = index;
        
        const tooltip = document.createElement('div');
        tooltip.className = 'frame-tooltip';
        tooltip.textContent = `#${index + 1} - ${formatTimestamp(frame.timestamp)}`;
        
        block.appendChild(tooltip);
        block.addEventListener('click', () => {
            // Remove previous selection
            if (selectedBlock) {
                selectedBlock.classList.remove('selected-block');
            }
            
            // Add new selection
            block.classList.add('selected-block');
            selectedBlock = block;
            
            // Find and scroll to corresponding row
            let targetRow;
            if (isFolded) {
                // In folded mode, we need to find the containing fold or exact row
                targetRow = frameList.querySelector(`tr[data-index="${index}"]`) ||
                          Array.from(frameList.querySelectorAll('.folded-rows')).find(row => {
                              const start = parseInt(row.dataset.startIndex);
                              const end = parseInt(row.dataset.endIndex);
                              return index >= start && index <= end;
                          });
            } else {
                targetRow = frameList.querySelector(`tr[data-index="${index}"]`);
            }
            
            if (targetRow) {
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (!targetRow.classList.contains('folded-rows')) {
                    highlightRow(targetRow);
                }
            }
        });
        
        timelineFrames.appendChild(block);
    }

    function addFoldedBlock(count, startIndex, endIndex) {
        const block = document.createElement('div');
        block.className = 'frame-block folded';
        block.style.width = `${frameWidth * 2}px`;
        
        const countLabel = document.createElement('div');
        countLabel.className = 'frame-count';
        countLabel.textContent = count;
        
        const tooltip = document.createElement('div');
        tooltip.className = 'frame-tooltip';
        tooltip.textContent = `${count} 帧 (#${startIndex + 1} - #${endIndex + 1})`;
        
        block.appendChild(countLabel);
        block.appendChild(tooltip);
        timelineFrames.appendChild(block);
    }

    async function handleFile(file) {
        if (!file || !file.name.toLowerCase().endsWith('.flv')) {
            alert('请选择FLV文件');
            return;
        }

        try {
            // Display file info
            filename.textContent = file.name;
            filesize.textContent = formatFileSize(file.size);
            
            // Clear previous results
            frameList.innerHTML = '';
            timelineFrames.innerHTML = '';
            errorInfo.classList.add('hidden');
            videoInfo.classList.add('hidden');
            currentFrames = [];
            
            // Show results container
            results.classList.remove('hidden');

            // Add progress bar
            const progressContainer = document.createElement('div');
            progressContainer.className = 'progress-container';
            progressContainer.innerHTML = `
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="progress-text">0%</div>
            `;
            const tableContainer = document.querySelector('.table-container');
            results.insertBefore(progressContainer, tableContainer);
            
            const progressFill = progressContainer.querySelector('.progress-fill');
            const progressText = progressContainer.querySelector('.progress-text');
            
            // Set up progress callback
            parser.setProgressCallback(({frames, currentFrame, progress}) => {
                // Update progress bar
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${Math.round(progress)}%`;
                
                // Add frame to collection
                currentFrames.push(currentFrame);
                
                // Update both views
                updateTimelineView();
                updateTableView();
            });
            
            // Read and parse file
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const result = await parser.parse(arrayBuffer);

            // Remove progress bar after completion
            progressContainer.remove();

            // Update video info if available
            if (parser.videoInfo.width > 0) {
                resolution.textContent = `${parser.videoInfo.width}x${parser.videoInfo.height}`;
                profile.textContent = parser.videoInfo.profile;
                level.textContent = parser.videoInfo.level;
                videoInfo.classList.remove('hidden');
            }

            // Display error if any
            if (result.error) {
                errorOffset.textContent = `0x${result.error.offset.toString(16).toUpperCase()} (${result.error.offset} 字节)`;
                errorMessage.textContent = result.error.message;
                parsedFrames.textContent = result.error.parsedFrames;
                errorInfo.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error parsing FLV file:', error);
            errorOffset.textContent = '0x0';
            errorMessage.textContent = error.message;
            parsedFrames.textContent = '0';
            errorInfo.classList.remove('hidden');
            
            // 确保移除进度条（如果存在）
            const existingProgress = document.querySelector('.progress-container');
            if (existingProgress) {
                existingProgress.remove();
            }
        }
    }

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e.target.error);
            reader.readAsArrayBuffer(file);
        });
    }

    function formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    function formatTimestamp(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = ms % 1000;
        
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }
}); 