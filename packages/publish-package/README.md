# Publish Package

A smart npm publishing utility that prevents version conflicts and handles common publishing errors gracefully.

## Features

- **🔍 Version Checking** - Automatically checks if a package version already exists on npm
- **🚫 Conflict Prevention** - Skips publishing if the version already exists
- **🛡️ Error Handling** - Gracefully handles common npm publishing errors
- **📝 Comprehensive Logging** - Clear feedback about what's happening during the publish process
- **🔐 Authentication Support** - Provides helpful messages for authentication issues
- **📋 Argument Passing** - Passes through additional arguments to npm publish

## Usage

### As a Script

Add this to your package.json scripts:

```json
{
  "scripts": {
    "publish": "node ../publish-package/src/index.js"
  }
}
```

### Direct Execution

```bash
# From the package directory
node ../publish-package/src/index.js

# Or if you're in the publish-package directory
node src/index.js
```

### With Additional Arguments

You can pass additional arguments that will be forwarded to `npm publish`:

```bash
# Publish with a specific tag
npm run publish -- --tag beta

# Dry run (test without actually publishing)
npm run publish -- --dry-run

# Publish with custom registry
npm run publish -- --registry https://custom.npmjs.org

# Combine multiple arguments
npm run publish -- --tag latest --dry-run
```

**Note**: Use `--` to separate npm script arguments from arguments passed to the publish script.

## How It Works

1. **Reads package.json** from the current working directory
2. **Captures arguments** passed to the script
3. **Checks npm registry** to see if the version already exists
4. **Skips publish** if version exists (no error, just skips)
5. **Attempts publish** if version is new, passing through additional arguments
6. **Handles errors** gracefully for common scenarios

## Error Handling

The script handles these scenarios gracefully:

- ✅ **Version already exists** - Skips publish, no error
- ✅ **Authentication required** - Clear error message with solution
- ✅ **Insufficient permissions** - Clear error message
- ❌ **Other errors** - Shows full error details and fails

## Example Output

### With Additional Arguments
```
📦 Starting package publish process...
📝 Additional arguments: --tag beta --dry-run
📋 Package: @robot.com/my-package
🏷️  Version: 1.2.4
🔍 Checking if version already exists on npm...
✨ Version 1.2.4 is new, proceeding with publish...
✅ Package published successfully!
🎉 Publish process completed successfully!
```

### Successful Version Check (Skip)
```
📦 Starting package publish process...
📋 Package: @robot.com/my-package
🏷️  Version: 1.2.3
🔍 Checking if version already exists on npm...
⚠️  Version 1.2.3 already exists on npm
🚫 Skipping publish - no action needed
```

### Successful Publish
```
📦 Starting package publish process...
📋 Package: @robot.com/my-package
🏷️  Version: 1.2.4
🔍 Checking if version already exists on npm...
✨ Version 1.2.4 is new, proceeding with publish...
✅ Package published successfully!
🎉 Publish process completed successfully!
```

### Authentication Error
```
📦 Starting package publish process...
📋 Package: @robot.com/my-package
🏷️  Version: 1.2.4
🔍 Checking if version already exists on npm...
✨ Version 1.2.4 is new, proceeding with publish...
❌ Not logged in to npm. Please run: npm login
💥 Publish process failed: Authentication required
```

## Integration with Build Process

This utility is designed to work with the build-package system:

1. **Build** your package: `npm run build`
2. **Publish** your package: `npm run publish`
3. **Publish with options**: `npm run publish -- --tag beta`

The publish script will automatically:
- Check if the version exists
- Skip if it does (no build failure)
- Publish if it's new
- Pass through any additional arguments
- Handle errors gracefully

## Common Use Cases

### Publishing Beta Versions
```bash
npm run publish -- --tag beta
```

### Testing Publish (Dry Run)
```bash
npm run publish -- --dry-run
```

### Publishing to Custom Registry
```bash
npm run publish -- --registry https://custom.npmjs.org
```

### Publishing with Specific Tag
```bash
npm run publish -- --tag latest
```

## Requirements

- Node.js 18+
- npm CLI installed and configured
- Valid package.json with name and version
- Proper npm authentication for publishing

## License

MIT License - see LICENSE file for details.
