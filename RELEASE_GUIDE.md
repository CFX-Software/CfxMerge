# 🚀 Release Guide

## Automated Release Process

This project uses GitHub Actions for fully automated builds and releases.

### How to Create a Release

1. **Ensure all changes are committed and pushed to master**
   ```bash
   git add .
   git commit -m "Prepare for v1.0.0 release"
   git push origin master
   ```

2. **Create and push a version tag**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. **That's it!** GitHub Actions will automatically:
   - ✅ Build the Windows application
   - ✅ Create installer with NSIS
   - ✅ Create a GitHub Release
   - ✅ Upload both `CfxMerge-amd64-installer.exe` and `CfxMerge.exe`

### Version Numbering

Follow semantic versioning: `vMAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (v2.0.0)
- **MINOR**: New features (v1.1.0)
- **PATCH**: Bug fixes (v1.0.1)

Examples:
```bash
git tag v1.0.0   # First release
git tag v1.0.1   # Bug fix
git tag v1.1.0   # New feature
git tag v2.0.0   # Breaking changes
```

### Workflow Files

- **`.github/workflows/release.yml`** - Triggers on version tags (v*.*.*), creates releases
- **`.github/workflows/build.yml`** - Builds on every push to master/dev for testing

### Monitoring Builds

1. Go to: https://github.com/VexoaXYZ/CfxMerge-Dev/actions
2. Watch the build progress in real-time
3. Check for any errors in the workflow logs

### Manual Release (if needed)

If you need to build locally:
```bash
wails build -nsis
```

Output files:
- `build/bin/CfxMerge.exe` - Portable executable
- `build/bin/CfxMerge-amd64-installer.exe` - Full installer

### Troubleshooting

**Build fails?**
- Check the Actions tab for detailed logs
- Ensure `wails.json` has correct version info
- Verify all dependencies are specified in `package.json` and `go.mod`

**Tag already exists?**
```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push --delete origin v1.0.0

# Create new tag
git tag v1.0.0
git push origin v1.0.0
```

### Pre-release Testing

Before creating a release tag, the build workflow runs automatically on pushes to `master` and `dev`. This ensures your code compiles successfully.

---

**Note:** All builds are cached for 7-30 days and can be downloaded from the Actions tab if needed.
