# GitHub Token Setup for Cross-Repo Releases

The workflow needs a Personal Access Token (PAT) to create releases on `CFX-Software/CfxMerge` from `CFX-Software/CfxMerge-Dev`.

## Steps to Create Token

1. **Go to GitHub Settings**
   - Click your profile picture → Settings
   - Or go to: https://github.com/settings/tokens

2. **Generate New Token**
   - Click "Developer settings" (bottom left)
   - Click "Personal access tokens" → "Tokens (classic)"
   - Click "Generate new token" → "Generate new token (classic)"

3. **Configure Token**
   - **Note:** `CfxMerge Release Token`
   - **Expiration:** No expiration (or choose your preference)
   - **Scopes:** Check these boxes:
     - ✅ `repo` (Full control of private repositories)
       - This includes: repo:status, repo_deployment, public_repo, repo:invite, security_events

4. **Generate and Copy**
   - Click "Generate token" at the bottom
   - **IMPORTANT:** Copy the token NOW (you won't see it again!)
   - It will look like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Add Token to Repository

1. **Go to CfxMerge-Dev Repository**
   - https://github.com/CFX-Software/CfxMerge-Dev

2. **Open Settings**
   - Click "Settings" tab
   - Click "Secrets and variables" → "Actions"

3. **Add Secret**
   - Click "New repository secret"
   - **Name:** `RELEASE_TOKEN`
   - **Secret:** Paste your token
   - Click "Add secret"

## That's It!

Now when you push a version tag (v1.0.1, v1.1.0, etc.), the workflow will:
- Build in `CfxMerge-Dev`
- Create releases in `CFX-Software/CfxMerge` (main repo)

## Quick Command Reference

```bash
# Create and push a new release
git tag v1.0.1
git push origin v1.0.1

# Watch the build
gh run watch --repo CFX-Software/CfxMerge-Dev

# Check release (will appear on main repo)
# https://github.com/CFX-Software/CfxMerge/releases
```
