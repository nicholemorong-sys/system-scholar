# ISKOLAR MARSU

A responsive, multi-page scholarship application and monitoring frontend for Marinduque State University. It uses semantic HTML, CSS, and vanilla JavaScript without a build step. When Supabase is configured, the Supabase JavaScript client is loaded from its CDN.

## Pages

- `index.html` / `login.html` / `student-login.html`: direct student sign-in
- `admin-login.html`: separate Admin / Staff sign-in
- `register.html`: explains that student accounts are provisioned by an administrator; public self-registration is intentionally disabled
- `student-dashboard.html`: student overview and recent notices
- `admin-dashboard.html`: staff overview, complete applicant register, review actions, student records, scholarship and announcement publishing, and payout schedule management
- `scholarships.html`: searchable scholarship directory and requirements
- `application.html`: scholarship application form and document/image attachments
- `profile.html`: student profile
- `announcements.html`: student announcements
- `tracking.html`: student-only application status and decision view
- `status-tracking.html`: status-tracking destination after an application is submitted
- `payouts.html`: published payout dates and release instructions

Shared assets: `styles.css`, `app.js`, and the local `marsu_logo.png` official logo image.

## Features

- Distinct Student and Admin / Staff entry points. Selecting Admin / Staff leads directly to the separate staff login.
- Student and Admin / Staff sign-in use separate role-specific pages. With Supabase configured, sign-in uses Supabase Auth and each account's provisioned role; without configuration, the local prototype login remains available. Public student self-registration remains disabled.
- Student-side scholarship search/filter, complete application submission (including applicant name and contact details), profile editing, announcements, status tracking, and payout viewing.
- Staff-side all-applicant table with search and status/program filters; full application detail/document review; approve and reject actions; CSV export; student account record management; scholarship and announcement publishing; and payout schedule management.
- With Supabase configured, student sign-in uses each provisioned Auth account and its assigned profile; new application IDs are unique. Applications are refreshed from the server at sign-in, page focus, and reload. In local prototype mode, sample-account matching and same-browser localStorage behavior remain available.
- With Supabase configured, application records are stored in PostgreSQL and original requirement files are uploaded to a private Supabase Storage bucket under `Applicant-{ApplicationID}` paths. Role-based Row Level Security lets students access only their applications and staff review all applications. This keeps files and application details available across devices. Without backend configuration, the prototype continues to store Base64 files and records in localStorage. Admin / Staff can download each available file from the application details panel and manually save it in a desktop folder named `Applicant-{ApplicationID}`.
- Responsive sidebar navigation, notification panel, keyboard skip link, visible focus states, semantic tables/forms, accessible names, and reduced-motion support.

## Supabase setup

The Supabase integration is optional until a project is configured. To enable authenticated cross-device applications and permanent file storage:

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor. This creates the profiles, applications, and requirement-file tables, a private `requirements` bucket, and Row Level Security policies.
2. In Supabase Auth, create each student and staff user. In the SQL Editor, add a matching `public.profiles` row for each Auth user's UUID. For example:

   ```sql
   insert into public.profiles (user_id, role, student_id, full_name, course, email)
   values ('AUTH-USER-UUID', 'student', '2023-00124', 'Student Name', 'BS Program', 'student@example.edu');
   ```

   Set `role` to `student` or `admin`; give students their assigned `student_id`. Public self-registration is not enabled.
3. Set the Supabase project URL and public anon/publishable key in `supabase-config.js`. Never put a `service_role` key in this frontend.
4. Host the site over HTTPS and configure the same origin in the Supabase Auth URL settings. Login, application records, private file uploads, and signed file downloads then use the configured Supabase project.

Until URL and key are configured, the site intentionally stays in local prototype mode: credentials are not verified, data is stored only in that browser's localStorage, and it is not synchronized across devices. Existing localStorage records are not automatically uploaded to Supabase; export or migrate them deliberately before switching production users. Base64 localStorage storage is subject to browser limits and should not be used for real applicant information.

## Run and test

1. Open `index.html` in a browser, or serve the folder with any static web server; Live Server is optional. For a phone on the same Wi-Fi, use a static server reachable on your trusted network and open its address on the phone.
2. In local prototype mode, verify role routing with any email and password. With Supabase configured, verify student and admin accounts can sign in only to their assigned portal.
3. With Supabase configured, test that application data and requirement uploads are accessible from a second device; verify students cannot read other applicants' records or files and only staff can change statuses.
4. As a student, test scholarship search/category filtering, required-field validation, multiple PDF/JPG/PNG uploads, image previews under My Applications, profile save, announcement viewing, status tracking, and payout schedules. Confirm status controls are not present in the student UI.
5. As Admin / Staff, test the full applicant list, filtering, applicant details and uploaded file downloads, approve/reject actions, CSV export, student record activation, scholarship/announcement publishing, and payout add/edit/remove.
6. Test keyboard-only use (skip link, navigation, forms, dialog, Escape to close), screen-reader labels/status messages, and layouts at approximately 360px, 768px, and 1280px widths. Check browser console/network errors and verify focus remains visible.

