```markdown
# Liftoffnew Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development conventions and workflows used in the Liftoffnew TypeScript codebase. You'll learn how to structure files, write imports/exports, follow commit standards, and organize tests. This guide ensures consistency and productivity when contributing to Liftoffnew.

## Coding Conventions

### File Naming
- **Pattern:** PascalCase  
  Example:  
  ```
  MyComponent.ts
  UserService.ts
  ```

### Import Style
- **Pattern:** Relative imports  
  Example:  
  ```typescript
  import { UserService } from './UserService';
  import { calculateScore } from '../utils/ScoreUtils';
  ```

### Export Style
- **Pattern:** Named exports  
  Example:  
  ```typescript
  // In UserService.ts
  export function getUser(id: string) { ... }
  export const DEFAULT_ROLE = 'user';
  ```

### Commit Message Style
- **Pattern:** Conventional commits with `feat` prefix  
  Example:  
  ```
  feat: add user authentication module
  feat: improve error handling in payment flow
  ```

## Workflows

### Add a New Feature
**Trigger:** When implementing a new feature or module  
**Command:** `/add-feature`

1. Create a new file using PascalCase (e.g., `NewFeature.ts`).
2. Use relative imports to include dependencies.
3. Export all functions or constants using named exports.
4. Write or update corresponding test files (`NewFeature.test.ts`).
5. Commit changes using the conventional commit style:
   ```
   feat: short description of the feature
   ```

### Update or Refactor Code
**Trigger:** When modifying or refactoring existing code  
**Command:** `/update-code`

1. Locate the relevant file(s) using PascalCase naming.
2. Make changes, ensuring imports/exports remain relative and named.
3. Update or add tests as necessary.
4. Commit with a descriptive message:
   ```
   feat: refactor [module] to improve readability
   ```

### Run Tests
**Trigger:** Before pushing changes or after making updates  
**Command:** `/run-tests`

1. Identify test files matching `*.test.*` pattern.
2. Run the tests using your preferred test runner (framework not specified).
3. Ensure all tests pass before merging or pushing.

## Testing Patterns

- **File Pattern:** Test files are named with `.test.` in the filename, e.g., `UserService.test.ts`.
- **Framework:** Not specified; use your preferred TypeScript-compatible test runner.
- **Example:**
  ```typescript
  // UserService.test.ts
  import { getUser } from './UserService';

  test('should return user by id', () => {
    expect(getUser('123')).toEqual({ id: '123', name: 'Alice' });
  });
  ```

## Commands
| Command        | Purpose                                      |
|----------------|----------------------------------------------|
| /add-feature   | Scaffold and commit a new feature/module     |
| /update-code   | Refactor or update existing code             |
| /run-tests     | Run all tests in the repository              |
```
