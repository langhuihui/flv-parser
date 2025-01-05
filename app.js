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
    let isFolded = false;
    let frameWidth = 10;
    let currentFrames = [];

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
    });

    zoomInButton.addEventListener('click', () => {
        frameWidth = Math.min(frameWidth * 1.5, 40);
        updateTimelineView();
    });

    zoomOutButton.addEventListener('click', () => {
        frameWidth = Math.max(frameWidth / 1.5, 5);
        updateTimelineView();
    });

    function updateTimelineView() {
        timelineFrames.innerHTML = '';
        
        if (isFolded) {
            let nonKeyFrameCount = 0;
            let lastKeyFrameIndex = -1;
            
            currentFrames.forEach((frame, index) => {
                if (frame.type === 'video' && frame.isKeyframe) {
                    // If we have accumulated non-key frames, add them as a folded block
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
            
            // Add remaining non-key frames if any
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
        
        const tooltip = document.createElement('div');
        tooltip.className = 'frame-tooltip';
        tooltip.textContent = `#${index + 1} - ${formatTimestamp(frame.timestamp)}`;
        
        block.appendChild(tooltip);
        block.addEventListener('click', () => {
            // Scroll to the corresponding table row
            const row = frameList.children[index];
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('highlight');
                setTimeout(() => row.classList.remove('highlight'), 2000);
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
                
                // Add new frame to the table
                const row = document.createElement('tr');
                row.classList.add(`frame-${currentFrame.type}`);
                
                row.innerHTML = `
                    <td>${frames.length}</td>
                    <td>${formatTimestamp(currentFrame.timestamp)}</td>
                    <td>${currentFrame.type}</td>
                    <td>${formatFileSize(currentFrame.size)}</td>
                    <td><pre>${currentFrame.details || '-'}</pre></td>
                `;
                
                frameList.appendChild(row);
                
                // Add frame to timeline
                currentFrames.push(currentFrame);
                updateTimelineView();
                
                // Auto-scroll to bottom if needed
                const container = frameList.parentElement;
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
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