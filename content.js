let gitHubUsername = null;
let repo = null;
let gitHubToken = null;

function getFileExtension(language) {
    const extensions = {
        'Java': 'java',
        'Python': 'py',
        'Python3': 'py',
        'C++': 'cpp',
        'C': 'c',
        'JavaScript': 'js',
        'TypeScript': 'ts',
        'Go': 'go',
        'Ruby': 'rb',
        'Swift': 'swift',
        'Kotlin': 'kt',
        'Rust': 'rs',
        'PHP': 'php',
        'C#': 'cs',
        'Scala': 'scala',
        'Dart': 'dart',
        'Elixir': 'ex',
        'Erlang': 'erl'
    };
    return extensions[language] || 'txt';
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
            chrome.storage.sync.get(['githubUsername', 'githubRepo', 'githubToken'], function(result) {
                if (chrome.runtime.lastError) {
                    console.error('❌ Extension context error loading credentials:', chrome.runtime.lastError.message);
                    console.log('Please reload the page and try again.');
                    resolve(false);
                    return;
                }
                
                if (result.githubUsername && result.githubToken) {
                    gitHubUsername = result.githubUsername;
                    repo = result.githubRepo || 'Codeforces';
                    gitHubToken = result.githubToken;
                    console.log('Credentials loaded successfully');
                    resolve(true);
                } else {
                    console.log('No credentials found. Please set up your GitHub credentials in the extension popup.');
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
    
    // Check if file exists
    try {
        const response = await fetch(`https://api.github.com/repos/${gitHubUsername}/${repo}/contents/${filename}`, {
            method: 'GET',
            headers: {
                'Authorization': `token ${gitHubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            const fileData = await response.json();
            sha = fileData.sha;
            
            const shouldOverwrite = confirm(
                `🔄 Overwrite Existing Solution?\n\n` +
                `A solution for "${filename}" already exists in your GitHub repository.\n\n` +
                `Do you want to overwrite it with your new submission?\n\n` +
                `✅ Click OK to overwrite\n` +
                `❌ Click Cancel to skip`
            );
            
            if (!shouldOverwrite) {
                console.log('User chose not to overwrite existing solution. Skipping upload.');
                showNotification('⏭️ Skipped upload - existing solution preserved', 'info');
                return false;
            }
            
            showNotification('🔄 Overwriting existing solution...', 'info');
        } else if (response.status === 404) {
            console.log('File does not exist (404), creating new file');
            showNotification('📝 Creating new solution file...', 'info');
        }
    } catch (error) {
        console.log('Error checking for existing file:', error);
    }
    
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
        console.log(`✅ NEW SUBMISSION DETECTED!`);
        console.log(`   Last processed: ${lastProcessedSubmissionId}`);
        console.log(`   Current submission ID: ${currentSubmissionId}`);
        console.log(`   Submission row:`, firstHighlightedRow);
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
        background: rgba(0, 0, 0, 0.7);
        z-index: 100000;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: Arial, sans-serif;
    `;
    
    // Create modal content
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 8px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    
    content.innerHTML = `
        <h2 style="margin-top: 0; color: #333;">Select Solutions to Upload</h2>
        <p style="color: #666; margin-bottom: 20px;">Choose which solutions you'd like to upload to GitHub:</p>
        <div id="submission-list" style="margin-bottom: 20px;"></div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="cancel-upload" style="padding: 10px 20px; background: #ccc; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
            <button id="confirm-upload" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Upload Selected</button>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Populate submission list
    const listContainer = content.querySelector('#submission-list');
    const selectedSubmissions = new Set();
    
    submissions.forEach((sub, index) => {
        const submissionDiv = document.createElement('div');
        submissionDiv.style.cssText = `
            padding: 15px;
            margin-bottom: 10px;
            border: 2px solid #e0e0e0;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        `;
        
        const problemName = sub.problem.name || `Problem ${sub.problem.index}`;
        const contestId = sub.contestId || 'Unknown';
        const submissionId = sub.id;
        const language = sub.programmingLanguage || 'Unknown';
        const submissionTime = new Date(sub.creationTimeSeconds * 1000).toLocaleString();
        
        submissionDiv.innerHTML = `
            <label style="display: flex; align-items: center; cursor: pointer; width: 100%;">
                <input type="checkbox" style="margin-right: 10px; width: 18px; height: 18px;" 
                       data-submission-id="${submissionId}"
                       data-contest-id="${contestId}"
                       data-problem-name="${problemName}"
                       data-language="${language}">
                <div style="flex: 1;">
                    <div style="font-weight: bold; color: #333; margin-bottom: 5px;">${problemName}</div>
                    <div style="font-size: 12px; color: #666;">
                        Contest ${contestId} • ${language} • ${submissionTime}
                    </div>
                </div>
            </label>
        `;
        
        const checkbox = submissionDiv.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedSubmissions.add(sub);
                submissionDiv.style.borderColor = '#4CAF50';
                submissionDiv.style.background = '#f0f8f0';
            } else {
                selectedSubmissions.delete(sub);
                submissionDiv.style.borderColor = '#e0e0e0';
                submissionDiv.style.background = 'white';
            }
        });
        
        submissionDiv.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        
        listContainer.appendChild(submissionDiv);
    });
    
    // Handle cancel
    content.querySelector('#cancel-upload').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Handle confirm
    content.querySelector('#confirm-upload').addEventListener('click', async () => {
        if (selectedSubmissions.size === 0) {
            showNotification('Please select at least one solution', 'error');
            return;
        }
        
        content.querySelector('#confirm-upload').disabled = true;
        content.querySelector('#confirm-upload').textContent = 'Uploading...';
        
        // Upload each selected submission
        for (const sub of selectedSubmissions) {
            await uploadSubmissionToGitHub(sub);
        }
        
        document.body.removeChild(modal);
        showNotification(`✅ Uploaded ${selectedSubmissions.size} solution(s) to GitHub!`, 'success');
    });
}

async function uploadSubmissionToGitHub(submission) {
    // Fetch the actual code for this submission
    const code = await fetchSubmissionCodeFromAPI(submission);
    if (!code) {
        console.error('Could not fetch code for submission:', submission.id);
        return false;
    }
    
    const problemName = submission.problem.name || `Problem${submission.problem.index}`;
    const contestId = submission.contestId;
    const language = submission.programmingLanguage;
    
    // Format filename
    const sanitizedProblemName = problemName.replace(/[^a-zA-Z0-9]/g, '_');
    const extension = getFileExtension(language);
    const filename = `${contestId}_${sanitizedProblemName}.${extension}`;
    
    // Create commit message
    const commitMsg = `Add solution for ${problemName} (Contest ${contestId})`;
    
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
            // New submission detected - print message (you'll decide what to do next)
            const firstHighlightedRow = document.querySelector('table.status-frame-datatable tr.highlighted-row');
            const submissionId = firstHighlightedRow.getAttribute('data-submission-id');
            console.log('🎯 NEW SUBMISSION FOUND - Ready for next steps!');
            console.log(`   Submission ID: ${submissionId}`);
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
        setTimeout(() => {
            if (checkForNewSubmissions()) {
                const firstHighlightedRow = document.querySelector('table.status-frame-datatable tr.highlighted-row');
                const submissionId = firstHighlightedRow.getAttribute('data-submission-id');
                console.log('🎯 NEW SUBMISSION FOUND - Ready for next steps!');
                console.log(`   Submission ID: ${submissionId}`);
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
