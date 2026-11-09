# Manara Drama

Manara is the shared rehearsal app for your shows. It runs at:

**https://jonathanmorad.github.io/manara-cues/**

## First-time setup

The first person to open the app creates the admin account. Choose a username and a code with at least 6 characters. Keep these details safe.

As admin, open **Team** to create accounts. Give each person their username and code, then add them to the right show and choose their role there. Roles can differ between shows.

## Using the app

- **Home** shows your next date and notes sent to you.
- **Calendar** has a month grid and agenda view. Teal marks rehearsals; amber marks show dates. Tap a day to see its details. A director can select who sees each date, and invited people can reply whether they are going.
- **Show** contains scene scripts, role-specific cues, and rehearsal notes. Directors can add script text scene by scene. Scripts are shared with show members; personal notes stay private to their author and recipient.
- **Team** manages show members and roles. Admins can create accounts and shows.

Sound and lighting cues are shown according to each person’s role in that show. Lighting cues include a colour and fade timing.

## Account and data notes

The app uses the Manara Drama Firebase project for sign-in and shared data. Firestore rules restrict each show's materials to its members, restrict scripts to directors for editing, and limit rehearsal dates to their selected attendees. The app does not use Firebase Storage; scripts are stored as text in Firestore.

People need an internet connection to sign in and sync changes. The app can keep previously loaded data available on the same device when offline; it syncs after the connection returns.

A person can change their code from their account. If they forget it, an admin can create a new account with a new username; code reset is not available yet.

## Updating the app

The original ZIP is kept as downloaded. The working copy is in the project workspace. To publish a later update, upload the files from that working copy to the root of the `JonathanMorad/manara-cues` GitHub repository and commit the changes. GitHub Pages will update the same link after the deployment finishes.
