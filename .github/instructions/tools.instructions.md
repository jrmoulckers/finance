---
applyTo: "tools/**"
---
# Instructions for Development Tools

You are working in the `tools/` directory, which contains development tooling, scripts, and automation for the Finance monorepo.

## Guidelines

- Scripts should be cross-platform compatible (prefer Node.js/TypeScript over bash for portability)
- Include usage instructions as comments at the top of each script
- Tools should fail loudly with clear error messages — never fail silently
- Validate inputs and prerequisites before executing
- Use environment variables for configuration, not hardcoded values
- All tools should support a `--help` flag or equivalent
- Write tests for any tool with complex logic
- Document each tool in a README.md within its directory
