# Claude Code Project Rules

## Commit Message Format

Always use semantic commit messages following the Conventional Commits specification:

### Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types
- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files

### Examples
```
feat: add collaborative editing support
fix: resolve memory leak in editor component
docs: update installation instructions
style: format code with prettier
refactor: extract common editor utilities
perf: optimize block rendering performance
test: add unit tests for editor hooks
build: update build configuration for dist output
ci: add semantic-release workflow
chore: update dependencies
```

### Breaking Changes
For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:
```
feat!: change editor initialization API
```

## Build Commands
- Build: `pnpm build`
- Type check: `pnpm run type-check`