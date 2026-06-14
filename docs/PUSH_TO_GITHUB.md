# Pushing this project to GitHub (PowerShell, beginner walkthrough)

Goal: get this folder onto GitHub as a **private** repo, so the lab can see it and
Vercel can deploy the dashboard from it. Do these once. After that, the daily loop
is just three commands (bottom of this file).

The golden rule: **we never commit secrets.** The `.gitignore` already blocks
`config.toml`, `.env.local`, service-role keys, and big `.h5`/`.tif` data. Don't
remove those lines.

---

## Step 0 - Install Git (one time)

In PowerShell, check:

    git --version

- If you see a version (e.g. `git version 2.45.0`), you're good.
- If you see "not recognized", install Git for Windows from https://git-scm.com/download/win
  Accept all the default options. It includes "Git Credential Manager", which makes
  login easy (a browser window instead of typing passwords).

Close and reopen PowerShell after installing.

---

## Step 1 - Go to the project folder

    cd "C:\Users\19112\OneDrive\文档\Claude\Projects\Supersebastian666"

(The quotes matter because the path has non-English characters and could have spaces.)

Confirm you're in the right place - this should list ARCHITECTURE.md, worker, web, etc.:

    ls

---

## Step 2 - Tell Git who you are (one time, ever)

Use the SAME email as your GitHub account:

    git config --global user.name "Mike Zhang"
    git config --global user.email "mikezhang666128@gmail.com"

---

## Step 3 - Turn the folder into a repo and take the first snapshot

    git init
    git branch -M main
    git add -A
    git commit -m "Initial commit: pullback pipeline scaffold (worker, schema, dashboard, docs)"

What each line does:
- `git init`        - start tracking this folder.
- `git branch -M main` - name the main line of work "main" (GitHub's default).
- `git add -A`      - stage every file (except the ignored secrets/data).
- `git commit -m "..."` - save the snapshot with a message describing it.

Sanity check - this should show the files, and should NOT list config.toml or .env.local:

    git status
    git ls-files | Select-String "config.toml|.env.local"

The second command should print **nothing**. If it prints a filename, STOP and tell me.

---

## Step 4 - Create the empty repo on GitHub.com

1. Go to https://github.com/new
2. Repository name: `pullback-pipeline`
3. Visibility: **Private**
4. **Do NOT** check "Add a README", "Add .gitignore", or "Choose a license"
   (we already have those files locally; adding them on GitHub causes a conflict).
5. Click **Create repository**.

GitHub now shows you a page with commands. Ignore most of it - use Step 5 below.

---

## Step 5 - Connect local -> GitHub and upload

Replace `YOUR-USERNAME` with your GitHub username:

    git remote add origin https://github.com/YOUR-USERNAME/pullback-pipeline.git
    git push -u origin main

On the **first** push, a browser window pops up - sign in to GitHub and authorize.
That's Git Credential Manager doing the login for you; you won't have to repeat it.

- `git remote add origin ...` - save GitHub's address under the nickname "origin".
- `git push -u origin main`   - upload "main" to "origin"; `-u` remembers it so next
  time you can just type `git push`.

---

## Step 6 - Verify

Refresh your repo page on GitHub. You should see all the folders and files.
Click around `worker/` and `web/` to confirm. Done!

---

## The everyday loop (after any change)

    git add -A
    git commit -m "short description of what changed"
    git push

That's it. Edit -> add -> commit -> push.

---

## Notes / gotchas

- **OneDrive:** this folder is OneDrive-synced. Git works here, but if you ever see
  files like `something.git conflict` appear, it's OneDrive and git both touching the
  same files. It's harmless; tell me and I'll help clean it. (Long-term, many devs keep
  code OUTSIDE OneDrive, e.g. `C:\dev\pullback-pipeline`, but don't move it now.)
- **If `git push` asks for a username/password** instead of opening a browser, your Git
  is older and lacks Credential Manager. Reinstall Git for Windows (Step 0), or tell me
  and I'll walk you through a Personal Access Token.
- **Secrets check, any time:** `git ls-files | Select-String "key|secret|.env|config.toml"`
  should return nothing sensitive.
