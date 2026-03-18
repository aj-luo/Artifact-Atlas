# Skill: Supabase Authentication

This skill enables you to understand and implement robust authentication and authorization using Supabase.

## Core Competencies

1.  **User Authentication**: Implement various sign-up and sign-in methods (email/password, social OAuth, magic links).
2.  **Authorization with RLS**: Secure data access by creating and managing Row-Level Security (RLS) policies that integrate with Supabase Auth (`auth.uid()`, `auth.role()`).
3.  **Session Management**: Handle user sessions, including JWT validation, token refresh, and secure sign-out.
4.  **User Management**: Perform administrative tasks like fetching user lists, updating user metadata, and deleting users.
5.  **Provider Integration**: Configure and manage third-party OAuth providers like Google, GitHub, etc.

## Instructions

When asked to implement or advise on authentication with Supabase:

1.  **Identify the Auth Method**: Determine the required authentication method (e.g., email/password, social login).
2.  **Secure the Database**: Immediately consider database security. Propose RLS policies to protect data based on user identity (`uid`) and roles. This is critical.
3.  **Client-Side Implementation**: Provide code examples for the client-side (e.g., JavaScript) to handle sign-up, sign-in, and session management using `supabase-js`.
4.  **Server-Side/Edge Functions**: If server-side logic is needed, explain how to use the Supabase client in a secure server environment (e.g., using service role keys for admin tasks).
5.  **Consult `AGENTS.md`**: Use the `supabase-auth/AGENTS.md` file to navigate to detailed reference documents for specific implementation details (e.g., RLS policy syntax, JWT handling).
