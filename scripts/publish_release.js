const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function getGitHubToken() {
  try {
    const credOutput = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8'
    });
    const match = credOutput.match(/password=(.+)/);
    if (match) return match[1].trim();
  } catch (err) {
    console.error('Error fetching git credential:', err.message);
  }
  return null;
}

const token = getGitHubToken();
if (!token) {
  console.error('Failed to get GitHub token from credential manager.');
  process.exit(1);
}

const OWNER = 'BrannonSD';
const REPO = 'discord-data-export-explorer';
const TAG = 'v1.3.1';
const RELEASE_NAME = 'v1.3.1 - Discord Data Export Explorer';

const releaseNotesPath = path.join(__dirname, '..', 'RELEASE_NOTES.md');
const releaseBody = fs.readFileSync(releaseNotesPath, 'utf8');

const exePath = path.join(__dirname, '..', 'DiscordDataExportExplorer.exe');
if (!fs.existsSync(exePath)) {
  console.error('Executable not found at:', exePath);
  process.exit(1);
}

const exeStats = fs.statSync(exePath);
console.log(`Found binary: ${exePath} (${(exeStats.size / (1024 * 1024)).toFixed(2)} MB)`);

function apiRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: json, raw: body });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      if (Buffer.isBuffer(data) || typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

async function publishRelease() {
  console.log(`\n🚀 Creating GitHub Release ${TAG} for ${OWNER}/${REPO}...`);

  const releasePayload = {
    tag_name: TAG,
    target_commitish: 'main',
    name: RELEASE_NAME,
    body: releaseBody,
    draft: false,
    prerelease: false
  };

  const createRes = await apiRequest({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases`,
    method: 'POST',
    headers: {
      'User-Agent': 'Node-Release-Publisher',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(JSON.stringify(releasePayload))
    }
  }, releasePayload);

  let releaseData = createRes.data;

  if (createRes.status === 422 && createRes.data?.errors?.[0]?.code === 'already_exists') {
    console.log(`Release or tag already exists. Fetching release by tag...`);
    const getRes = await apiRequest({
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Node-Release-Publisher',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    releaseData = getRes.data;
  } else if (createRes.status !== 201) {
    console.error('Failed to create release:', createRes.status, createRes.data || createRes.raw);
    process.exit(1);
  }

  console.log(`✅ Release created/retrieved! ID: ${releaseData.id}, URL: ${releaseData.html_url}`);

  // Check if asset already exists on this release
  if (releaseData.assets && releaseData.assets.length > 0) {
    for (const asset of releaseData.assets) {
      if (asset.name === 'DiscordDataExportExplorer.exe') {
        console.log(`Deleting existing asset ${asset.name} (ID: ${asset.id})...`);
        await apiRequest({
          hostname: 'api.github.com',
          path: `/repos/${OWNER}/${REPO}/releases/assets/${asset.id}`,
          method: 'DELETE',
          headers: {
            'User-Agent': 'Node-Release-Publisher',
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json'
          }
        });
      }
    }
  }

  console.log(`\n📤 Uploading DiscordDataExportExplorer.exe to Release...`);
  const fileBuffer = fs.readFileSync(exePath);

  const uploadOptions = {
    hostname: 'uploads.github.com',
    path: `/repos/${OWNER}/${REPO}/releases/${releaseData.id}/assets?name=DiscordDataExportExplorer.exe`,
    method: 'POST',
    headers: {
      'User-Agent': 'Node-Release-Publisher',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileBuffer.length
    }
  };

  const uploadRes = await apiRequest(uploadOptions, fileBuffer);

  if (uploadRes.status === 201) {
    console.log(`🎉 SUCCESS! Asset uploaded: ${uploadRes.data.browser_download_url}`);
    console.log(`\n======================================================`);
    console.log(`🔗 GitHub Release Published: ${releaseData.html_url}`);
    console.log(`📦 Executable Download: ${uploadRes.data.browser_download_url}`);
    console.log(`======================================================\n`);
  } else {
    console.error('Asset upload failed:', uploadRes.status, uploadRes.data || uploadRes.raw);
    process.exit(1);
  }
}

publishRelease().catch(err => {
  console.error('Fatal publication error:', err);
  process.exit(1);
});
