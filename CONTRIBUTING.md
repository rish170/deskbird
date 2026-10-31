# Contributing to Deskbird

Thank you for your interest in contributing to Deskbird!

---

## 1. Development Setup

1. Clone the repository and install dependencies:
   ```powershell
   git clone https://github.com/rish170/deskbird.git
   cd deskbird
   npm install
   ```

2. Start the local full-stack development environment:
   ```powershell
   npm run dev:all
   ```

---

## 2. Quality Bar & Verification

Before submitting a Pull Request, ensure that all automated checks pass:

```powershell
# Run the test suite (unit and server integration tests)
npm test

# Run ESLint (must have 0 warnings and 0 errors)
npm run lint

# Verify web frontend build
npm run build
```

---

## 3. Pull Request Guidelines

1. **Maintain Aesthetic Integrity**: Strictly adhere to the 14-color palette in `docs/DESIGN.md`. Do not add gradients, blur effects, or generic sans-serif fonts.
2. **Preserve Click-Through**: Any added UI elements in the overlay must explicitly define whether they are interactive or click-through.
3. **Keep Logs Minimal**: Never log message content to stdout or disk.

