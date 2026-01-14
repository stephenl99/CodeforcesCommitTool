// Prevent duplicate execution if script is injected multiple times
(function() {
    'use strict';
    
    if (window.__codeforcesExtensionLoaded) {
        // Script already loaded, exit early
        return;
    }
    
    // Mark as loaded immediately to prevent duplicate execution
    window.__codeforcesExtensionLoaded = true;

// Variables
let gitHubUsername = null;
let repo = null;
let gitHubToken = null;
let handle = null; // Codeforces handle
let apiKey = null; // Codeforces API key
let apiSecret = null; // Codeforces API secret

// SHA-512 hash function using Web Crypto API
async function sha512hex(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function getFileExtension(language) {
    if (!language) return 'txt';
    
    // Normalize language string (case-insensitive, trim whitespace)
    const normalizedLang = language.trim();
    
    const extensions = {
        // Java
        'java': 'java',
        'java 8': 'java',
        'java 11': 'java',
        'java 17': 'java',
        
        // Python
        'python': 'py',
        'python 2': 'py',
        'python 3': 'py',
        'python3': 'py',
        'pypy': 'py',
        'pypy 2': 'py',
        'pypy 3': 'py',
        'pypy3': 'py',
        
        // C/C++
        'c++': 'cpp',
        'c++14': 'cpp',
        'c++17': 'cpp',
        'c++20': 'cpp',
        'g++': 'cpp',
        'ms c++': 'cpp',
        'c': 'c',
        'gnu c': 'c',
        'gnu c11': 'c',
        'gnu c17': 'c',
        
        // JavaScript/TypeScript
        'javascript': 'js',
        'node.js': 'js',
        'typescript': 'ts',
        
        // Go
        'go': 'go',
        
        // Ruby
        'ruby': 'rb',
        
        // Swift
        'swift': 'swift',
        
        // Kotlin
        'kotlin': 'kt',
        
        // Rust
        'rust': 'rs',
        
        // PHP
        'php': 'php',
        
        // C#
        'c#': 'cs',
        'mono c#': 'cs',
        '.net': 'cs',
        
        // Scala
        'scala': 'scala',
        
        // Dart
        'dart': 'dart',
        
        // Elixir
        'elixir': 'ex',
        
        // Erlang
        'erlang': 'erl',
        
        // Other languages
        'haskell': 'hs',
        'ocaml': 'ml',
        'pascal': 'pas',
        'delphi': 'pas',
        'perl': 'pl',
        'clojure': 'clj',
        'common lisp': 'lisp',
        'scheme': 'scm',
        'd': 'd',
        'nim': 'nim',
        'zig': 'zig',
        'crystal': 'cr',
        'julia': 'jl',
        'octave': 'm',
        'matlab': 'm',
        'r': 'r',
        'bash': 'sh',
        'shell': 'sh'
    };
    
    // Try exact match (case-insensitive)
    const lowerLang = normalizedLang.toLowerCase();
    if (extensions[lowerLang]) {
        return extensions[lowerLang];
    }
    
    // Try partial matches
    for (const [key, ext] of Object.entries(extensions)) {
        if (lowerLang.includes(key) || key.includes(lowerLang)) {
            return ext;
        }
    }
    
    // Default fallback
    console.warn(`Unknown language "${language}", using .txt extension`);
    return 'txt';
}

function isExtensionContextValid() {
    try {
        return chrome.runtime && chrome.runtime.id;
    } catch (error) {
        return false;
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        max-width: 300px;
        word-wrap: break-word;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function loadCredentials() {
    return new Promise((resolve) => {
        if (!isExtensionContextValid()) {
            console.error('❌ Extension context invalidated. Please reload the page.');
            resolve(false);
            return;
        }
        
        try {
            chrome.storage.sync.get(['githubUsername', 'githubRepo', 'githubToken', 'codeforcesHandle', 'apiKey', 'apiSecret'], function(result) {
                if (chrome.runtime.lastError) {
                    console.error('❌ Extension context error loading credentials:', chrome.runtime.lastError.message);
                    console.log('Please reload the page and try again.');
                    resolve(false);
                    return;
                }
                
                if (result.githubUsername && result.githubToken && result.codeforcesHandle && result.apiKey && result.apiSecret) {
                    gitHubUsername = result.githubUsername;
                    repo = result.githubRepo || 'Codeforces';
                    gitHubToken = result.githubToken;
                    handle = result.codeforcesHandle;
                    apiKey = result.apiKey;
                    apiSecret = result.apiSecret;
                    console.log('Credentials loaded successfully');
                    console.log('Codeforces handle:', handle);
                    resolve(true);
                } else {
                    console.log('No credentials found. Please set up your GitHub credentials, Codeforces handle, and API key/secret in the extension popup.');
                    resolve(false);
                }
            });
        } catch (error) {
            console.error('❌ Error accessing Chrome storage:', error.message);
            console.log('Extension may need to be reloaded. Please refresh the page.');
            resolve(false);
        }
    });
}

async function uploadToGitHub(filename, code, commitMsg, sha = null) {
    if (!gitHubUsername || !gitHubToken) {
        const hasCredentials = await loadCredentials();
        if (!hasCredentials) {
            console.log('❌ No GitHub credentials found. Please set up your credentials in the extension popup.');
            showNotification('❌ Please configure GitHub credentials in extension popup', 'error');
            return false;
        }
    }
    
    const base64Code = btoa(unescape(encodeURIComponent(code)));
    
    // Check if file exists (skip this check and let background script handle it)
    // We'll let the background script handle the file check to avoid CORS and permission issues
    // sha parameter is already available from function signature
    
    // Send to background script to avoid CORS
    if (!isExtensionContextValid()) {
        console.error('❌ Extension context invalidated. Please reload the page and try again.');
        return false;
    }
    
    try {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'uploadToGitHub',
                data: {
                    filename: filename,
                    code: base64Code,
                    username: gitHubUsername,
                    token: gitHubToken,
                    commitMsg: commitMsg,
                    sha: sha,
                    repo: repo
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Extension context error:', chrome.runtime.lastError.message);
                    console.log('Please reload the page and try again.');
                    showNotification('❌ Extension error - please reload page', 'error');
                    resolve(false);
                    return;
                }
                
                if (response && response.success) {
                    console.log('✅ GitHub upload successful:', response.result);
                    showNotification('✅ Solution saved to GitHub successfully!', 'success');
                    resolve(true);
                } else if (response) {
                    console.error('❌ GitHub upload failed:', response.error);
                    showNotification('❌ Failed to save solution to GitHub', 'error');
                    resolve(false);
                } else {
                    console.error('❌ No response from background script');
                    showNotification('❌ No response from extension', 'error');
                    resolve(false);
                }
            });
        });
    } catch (runtimeError) {
        console.error('❌ Runtime error:', runtimeError.message);
        console.log('Extension may need to be reloaded. Please refresh the page.');
        showNotification('❌ Runtime error - please reload page', 'error');
        return false;
    }
}

// Submission detection and management
let submissionObserver = null;
let lastProcessedSubmissionId = 0; // Track last processed submission ID

// Load last processed submission ID from storage
async function loadLastProcessedSubmissionId() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['lastProcessedSubmissionId'], (result) => {
            if (result.lastProcessedSubmissionId) {
                lastProcessedSubmissionId = result.lastProcessedSubmissionId;
            }
            resolve();
        });
    });
}

// Save last processed submission ID
async function saveLastProcessedSubmissionId(submissionId) {
    lastProcessedSubmissionId = submissionId;
    chrome.storage.local.set({ lastProcessedSubmissionId: submissionId });
}

// Check for new submissions on the contest submissions page
function checkForNewSubmissions() {
    // Check if we're on the right page
    if (!window.location.href.includes('/my') || !window.location.href.includes('/contest/')) {
        return false;
    }
    
    // Check if there's a div with text " My Submissions "
    const mySubmissionsDiv = Array.from(document.querySelectorAll('div')).find(div => 
        div.textContent && div.textContent.trim() === 'My Submissions'
    );
    
    if (!mySubmissionsDiv) {
        console.log('No " My Submissions " div found');
        return false;
    }
    
    // Check if there's a table with class status-frame-datatable
    const submissionsTable = document.querySelector('table.status-frame-datatable');
    if (!submissionsTable) {
        return false;
    }
    
    // Get the first row with class highlighted-row
    const firstHighlightedRow = submissionsTable.querySelector('tr.highlighted-row');
    if (!firstHighlightedRow) {
        return false;
    }
    
    // Get the data-submission-id from the first highlighted row
    const submissionId = firstHighlightedRow.getAttribute('data-submission-id');
    if (!submissionId) {
        return false;
    }
    
    // Get the current submission ID
    const currentSubmissionId = parseInt(submissionId, 10);
    
    // Check if the current submission ID is greater than the last processed
    if (currentSubmissionId > lastProcessedSubmissionId) {
        return true;
    }
    
    return false;
}

async function fetchLatestSubmissions(count = 10) {
    try {
        // Get Codeforces handle from the page
        const handleElement = document.querySelector('.lang-chooser a[href*="/profile/"]');
        if (!handleElement) {
            console.log('Could not find Codeforces handle on page');
            return null;
        }
        
        const handle = handleElement.textContent.trim();
        console.log('Found handle:', handle);
        
        // Fetch latest submissions from Codeforces API
        const response = await fetch(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=${count}`);
        if (!response.ok) {
            throw new Error(`Codeforces API error: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.status !== 'OK') {
            throw new Error(`Codeforces API error: ${data.comment || 'Unknown error'}`);
        }
        
        // Filter for accepted submissions only
        const acceptedSubmissions = data.result.filter(sub => 
            sub.verdict === 'OK' || sub.verdict === 'ACCEPTED'
        );
        
        return acceptedSubmissions.slice(0, count);
    } catch (error) {
        console.error('Error fetching submissions:', error);
        showNotification('❌ Failed to fetch submissions from Codeforces', 'error');
        return null;
    }
}

async function fetchSubmissionCode(submissionId) {
    try {
        // Navigate to submission page to get code
        const submissionUrl = `https://codeforces.com/contest/${submissionId.split('/')[0]}/submission/${submissionId.split('/')[1]}`;
        const response = await fetch(submissionUrl);
        const html = await response.text();
        
        // Parse code from the page (this is a simplified version)
        // In practice, you might need to use the Codeforces API or parse the HTML more carefully
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const codeElement = doc.querySelector('#program-source-text, .prettyprint');
        
        if (codeElement) {
            return codeElement.textContent;
        }
        
        // Alternative: Use Codeforces API if available
        // For now, we'll need to extract from the submission page
        return null;
    } catch (error) {
        console.error('Error fetching submission code:', error);
        return null;
    }
}

function showSolutionSelectionModal(submissions) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'cf-solution-selector-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 100000;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        animation: fadeIn 0.2s ease;
    `;
    
    // Add fade-in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    // Create modal content
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 32px;
        border-radius: 16px;
        max-width: 640px;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        animation: slideUp 0.3s ease;
    `;
    
    content.innerHTML = `
        <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.5px;">Select Solutions</h2>
        <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px; line-height: 1.5;">Choose which solutions to upload to GitHub</p>
        <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
            <button id="select-all-btn" style="padding: 10px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);">Select All</button>
            <span id="selected-count" style="color: #6b7280; font-size: 14px; font-weight: 500;">0 selected</span>
        </div>
        <div id="submission-list" style="margin-bottom: 24px;"></div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="cancel-upload" style="padding: 12px 24px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s;">Cancel</button>
            <button id="confirm-upload" style="padding: 12px 24px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">Upload Selected</button>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Populate submission list
    const listContainer = content.querySelector('#submission-list');
    const selectedSubmissions = new Set();
    const selectAllBtn = content.querySelector('#select-all-btn');
    const selectedCountSpan = content.querySelector('#selected-count');
    let allCheckboxes = [];
    
    // Function to update selected count display
    function updateSelectedCount() {
        const count = selectedSubmissions.size;
        selectedCountSpan.textContent = `${count} selected`;
        selectAllBtn.textContent = count === submissions.length ? 'Deselect All' : 'Select All';
    }
    
    // Select All button handler
    selectAllBtn.addEventListener('click', () => {
        const allSelected = selectedSubmissions.size === submissions.length;
        
        if (allSelected) {
            // Deselect all
            selectedSubmissions.clear();
            allCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
                const submissionDiv = checkbox.closest('div[style*="padding: 16px"]');
                if (submissionDiv) {
                    submissionDiv.style.borderColor = '#e5e7eb';
                    submissionDiv.style.background = '#fafafa';
                    submissionDiv.style.boxShadow = 'none';
                }
            });
        } else {
            // Select all
            submissions.forEach(sub => {
                selectedSubmissions.add(sub);
            });
            allCheckboxes.forEach(checkbox => {
                checkbox.checked = true;
                const submissionDiv = checkbox.closest('div[style*="padding: 16px"]');
                if (submissionDiv) {
                    submissionDiv.style.borderColor = '#667eea';
                    submissionDiv.style.background = 'linear-gradient(135deg, #f0f4ff 0%, #f5f3ff 100%)';
                    submissionDiv.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
                }
            });
        }
        
        updateSelectedCount();
    });
    
    submissions.forEach((sub, index) => {
        const submissionDiv = document.createElement('div');
        submissionDiv.style.cssText = `
            padding: 16px;
            margin-bottom: 12px;
            border: 1.5px solid #e5e7eb;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            background: #fafafa;
        `;
        
        const problemName = sub.problem.name || `Problem ${sub.problem.index || 'Unknown'}`;
        const contestId = sub.contestId || 'Unknown';
        const submissionId = sub.id;
        const language = sub.programmingLanguage || 'Unknown';
        const verdict = sub.verdict || 'Unknown';
        const submissionTime = sub.creationTimeSeconds ? new Date(sub.creationTimeSeconds * 1000).toLocaleString() : 'Unknown';
        const points = sub.points !== undefined ? sub.points : null;
        const passedTests = sub.passedTestCount !== undefined ? sub.passedTestCount : null;
        
        submissionDiv.innerHTML = `
            <label style="display: flex; align-items: flex-start; cursor: pointer; width: 100%; gap: 12px;">
                <input type="checkbox" style="margin-top: 2px; width: 20px; height: 20px; cursor: pointer; accent-color: #667eea; flex-shrink: 0;" 
                       data-submission-id="${submissionId}"
                       data-contest-id="${contestId}"
                       data-problem-name="${problemName}"
                       data-language="${language}">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 6px; font-size: 15px; letter-spacing: -0.2px;">${problemName}</div>
                    <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px; display: flex; flex-wrap: wrap; gap: 8px;">
                        <span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px;">Contest ${contestId}</span>
                        <span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px;">${language}</span>
                    </div>
                    <div style="font-size: 12px; color: #9ca3af; margin-top: 6px;">
                        ${submissionTime}${verdict === 'OK' ? ' • <span style="color: #10b981; font-weight: 500;">✓ Accepted</span>' : ` • ${verdict}`}${points !== null ? ` • ${points} pts` : ''}${passedTests !== null ? ` • ${passedTests} tests` : ''}
                    </div>
                </div>
            </label>
        `;
        
        const checkbox = submissionDiv.querySelector('input[type="checkbox"]');
        allCheckboxes.push(checkbox);
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedSubmissions.add(sub);
                submissionDiv.style.borderColor = '#667eea';
                submissionDiv.style.background = 'linear-gradient(135deg, #f0f4ff 0%, #f5f3ff 100%)';
                submissionDiv.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
            } else {
                selectedSubmissions.delete(sub);
                submissionDiv.style.borderColor = '#e5e7eb';
                submissionDiv.style.background = '#fafafa';
                submissionDiv.style.boxShadow = 'none';
            }
            updateSelectedCount();
        });
        
        submissionDiv.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        
        listContainer.appendChild(submissionDiv);
    });
    
    // Add hover effects to buttons
    const cancelBtn = content.querySelector('#cancel-upload');
    const confirmBtn = content.querySelector('#confirm-upload');
    
    selectAllBtn.addEventListener('mouseenter', () => {
        selectAllBtn.style.transform = 'translateY(-1px)';
        selectAllBtn.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
    });
    selectAllBtn.addEventListener('mouseleave', () => {
        selectAllBtn.style.transform = 'translateY(0)';
        selectAllBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
    });
    
    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = '#e5e7eb';
    });
    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = '#f3f4f6';
    });
    
    confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.transform = 'translateY(-1px)';
        confirmBtn.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
    });
    confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.transform = 'translateY(0)';
        confirmBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    });
    
    // Handle cancel
    cancelBtn.addEventListener('click', () => {
        modal.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => {
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
        }, 200);
    });
    
    // Handle confirm
    confirmBtn.addEventListener('click', async () => {
        if (selectedSubmissions.size === 0) {
            showNotification('Please select at least one solution', 'error');
            return;
        }
        
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Uploading...';
        confirmBtn.style.opacity = '0.7';
        confirmBtn.style.cursor = 'not-allowed';
        
        // Upload each selected submission
        for (const sub of selectedSubmissions) {
            await uploadSubmissionToGitHub(sub);
        }
        
        modal.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => {
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
        }, 200);
        showNotification(`✅ Uploaded ${selectedSubmissions.size} solution(s) to GitHub!`, 'success');
    });
}

async function uploadSubmissionToGitHub(submission) {
    // Get source code from API response (sourceBase64 field)
    let code = null;
    if (submission.sourceBase64) {
        try {
            code = atob(submission.sourceBase64);
        } catch (error) {
            console.error('Error decoding sourceBase64:', error);
            return false;
        }
    } else {
        // Fallback: try to fetch from submission page if sourceBase64 not available
        code = await fetchSubmissionCodeFromAPI(submission);
        if (!code) {
            console.error('Could not get code for submission:', submission.id);
            return false;
        }
    }
    
    const problemName = submission.problem.name || `Problem ${submission.problem.index}`;
    const contestId = submission.contestId || 'Unknown';
    const language = submission.programmingLanguage || 'Unknown';
    const verdict = submission.verdict || 'Unknown';
    
    // Format filename
    const sanitizedProblemName = problemName.replace(/[^a-zA-Z0-9]/g, '_');
    const extension = getFileExtension(language);
    const filename = `${contestId}_${sanitizedProblemName}.${extension}`;
    
    // Create commit message with more details
    const commitMsg = `Add solution for ${problemName} (Contest ${contestId}, ${verdict})`;
    
    // Upload to GitHub
    const success = await uploadToGitHub(filename, code, commitMsg);
    
    // Mark submission as processed if upload was successful
    if (success) {
        await saveLastProcessedSubmissionId(submission.id);
    }
    
    return success;
}

async function fetchSubmissionCodeFromAPI(submission) {
    try {
        // Codeforces doesn't have a public API for submission source code
        // We need to fetch it from the submission page
        const contestId = submission.contestId;
        const submissionId = submission.id;
        const submissionUrl = `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;
        
        // Use background script to fetch (to avoid CORS)
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'fetchSubmissionCode',
                url: submissionUrl
            }, (response) => {
                if (response && response.success) {
                    resolve(response.code);
                } else {
                    resolve(null);
                }
            });
        });
    } catch (error) {
        console.error('Error fetching submission code:', error);
        return null;
    }
}

function startSubmissionMonitoring() {
    // Monitor for new submissions using MutationObserver
    submissionObserver = new MutationObserver((mutations) => {
        if (checkForNewSubmissions()) {
            // New submission detected - trigger fetch
            const firstHighlightedRow = document.querySelector('table.status-frame-datatable tr.highlighted-row');
            const submissionId = firstHighlightedRow.getAttribute('data-submission-id');
        }
    });
    
    // Start observing
    submissionObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-submission-id']
    });
    
    // Also check on page load/navigation
    const checkOnLoad = () => {
        setTimeout(async () => {
            if (checkForNewSubmissions()) {
                const firstHighlightedRow = document.querySelector('table.status-frame-datatable tr.highlighted-row');
                const submissionId = firstHighlightedRow.getAttribute('data-submission-id');
                const rand = Math.floor(Math.random() * 900000) + 100000;
                const time = Math.floor(Date.now() / 1000); // Unix timestamp in seconds (replicates System.currentTimeMillis()/1000)
                const apiSigString = rand + '/user.status?apiKey=' + apiKey + '&count=10&from=1&handle=' + handle + '&includeSources=true&time=' + time + '#' + apiSecret;
                const hash = await sha512hex(apiSigString);
                const url = 'https://codeforces.com/api/user.status?handle=' + handle + '&from=1&count=10&includeSources=true&apiKey=' + apiKey + '&time=' + time + '&apiSig=' + rand + hash;
                const response = await fetch(url);
                const data = await response.json();
                if (data.status !== 'OK') {
                    throw new Error(`Codeforces API error: ${data.comment || 'Unknown error'}`);
                }
                const submissions = data.result;
                if (submissions.length > 0) {
                    // Filter for accepted submissions only
                    const acceptedSubmissions = submissions.filter(sub => 
                        sub.verdict === 'OK' || sub.verdict === 'ACCEPTED'
                    );
                    
                    if (acceptedSubmissions.length > 0) {
                        showSolutionSelectionModal(acceptedSubmissions);
                    }
                }
            }
        }, 2000);
    };
    
    checkOnLoad();
    
    // Monitor URL changes (for SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            checkOnLoad();
        }
    }).observe(document, { subtree: true, childList: true });
}

// Message listener for popup requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle show solution modal (injected from background script)
    if (request.action === 'showSolutionModal') {
        showSolutionSelectionModal(request.submissions);
        sendResponse({ success: true });
        return true;
    }
    
    // Ping handler to check if content script is loaded
    if (request.action === 'ping') {
        sendResponse({ success: true, loaded: true });
        return true;
    }
});

// Initialize when on Codeforces
if (window.location.href.includes("codeforces.com")) {
    loadLastProcessedSubmissionId().then(() => {
        loadCredentials().then((hasCredentials) => {
            if (hasCredentials) {
                console.log('✅ Extension ready with GitHub credentials');
                startSubmissionMonitoring();
            } else {
                console.log('⚠️ Extension loaded but no GitHub credentials found');
            }
        });
    });
}

})(); // End of IIFE wrapper
