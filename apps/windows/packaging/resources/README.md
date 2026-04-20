# Application Resources

This directory is mapped to `appResourcesRootDir` in `build.gradle.kts`.
Place any runtime resources here that should be bundled with the application.

## Structure

```
resources/
├── windows/          # Windows-specific resources
│   ├── icons/       # Application icons for various contexts
│   └── strings/     # Localized strings (future)
└── common/          # Cross-platform resources
    └── data/        # Default data files
```
