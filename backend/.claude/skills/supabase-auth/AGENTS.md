# Supabase Auth Best Practices

## Structure

```
supabase-auth/
  SKILL.md       # Main skill file - read this first
  AGENTS.md      # This navigation guide
  CLAUDE.md      # Symlink to AGENTS.md
  references/    # Detailed reference files
```

## Usage

1. Read `SKILL.md` for the main skill instructions.
2. Browse `references/` for detailed documentation on specific topics like JWT handling, RLS with Auth, and provider setups.
3. Reference files are loaded on-demand - read only what you need.

This skill provides a comprehensive guide to implementing and managing authentication using Supabase Auth. It covers everything from basic setup to advanced security practices.

## When to Apply

Reference these guidelines when:
- Setting up user authentication (email/password, social logins, magic links).
- Securing database access with Row-Level Security (RLS) based on user roles.
- Managing user sessions and JSON Web Tokens (JWTs).
- Implementing custom authentication flows.
- Integrating third-party authentication providers.

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Security & RLS | CRITICAL | `security-` |
| 2 | User Management | HIGH | `user-` |
| 3 | Session & JWT | HIGH | `session-` |
| 4 | Providers & OAuth | MEDIUM | `provider-` |
| 5 | Customization | LOW-MEDIUM | `custom-` |

## How to Use

Read individual rule files for detailed explanations and examples:

```
references/security-rls-policies.md
references/user-sign-up-in.md
references/session-jwt-handling.md
```

Each rule file contains:
- Brief explanation of why it matters.
- Code examples (e.g., JavaScript, SQL).
- Correct implementation with explanation.
- Supabase-specific notes and best practices.

## References

- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/learn/auth-deep-dive/auth-deep-dive-jwts
- https://jwt.io/
