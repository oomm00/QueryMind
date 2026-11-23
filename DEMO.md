# QueryMind 5-minute demo script

This is the **two-repo local demo**. It uses the real backend, real DB/Chroma, real JWT auth,
real attempts/mastery writes and the real browser UI. Static course copy is the only mocked
part; learner data is never mocked. No push, merge or cherry-pick is needed.

## 0. Before the room (30 seconds)

```powershell
cd D:\querymind
.\start-demo.ps1 -Live        # use -Offline when the room has no LLM/quota
```

Expected final lines:

```text
OK branch: D:\querymind -> hardening
OK branch: D:\querymind-frontend -> frontend-redesign
OK port free: 8000
OK port free: 5174
DEMO READY
  Frontend: http://localhost:5174
  Backend:  http://localhost:8000
```

Health check:

```powershell
curl.exe http://localhost:8000/health
```

Live shows `offline_demo_mode:false`; offline shows `offline_demo_mode:true`.
Do **not** use `docker compose down -v`; only stop/restart services.

## 1. Open and register (30 seconds)

Open <http://localhost:5174>. Click **Create account**, use any demo email, a 12+ char password.
You land in the workspace. Say: “Nothing is seeded for this learner — registration is real.”

## 2. Generate a custom topic (45 seconds)

1. Go to **Practice**.
2. Topic: `Paging and Virtual Memory`.
3. Keep **Adaptive (recommended)** on.
4. Click **Generate questions**.

Talking point: “The topic is typed live. The server decides `num_questions`, so the browser
cannot inflate marks. The request carries `uploaded_only` when the box is checked.”

If LLM quota is gone, the UI still shows progress and then a usable cached/bank question.
That is intentional degradation, not a mock.

## 3. Real uploaded PDF (60 seconds)

1. Go to **My notes → Documents**.
2. Subject `OS`, Topic `Paging and Virtual Memory`.
3. Upload the bundled real PDF used in rehearsals (926 bytes; text about pages/frames):
   `C:\Users\omsat\AppData\Local\Temp\opencode\qm_demo_upload.pdf`.
4. Back to **Practice**, type the same topic, tick **Use only my uploaded material**, generate.

In **live** mode the generated question cites the uploaded PDF (`source: live`, `source_chunks`
contains the PDF). The browser proof prints this. In **offline** mode retrieval/LLM are skipped;
the API returns a cached/bank question with an offline warning, and the UI stays usable.

Badge to show: **Generated 1 mark** — generated questions count but are labelled.

## 4. Middle band and mastery ladder (90 seconds)

Use topic `Deadlocks` for a clean adaptive walk. Submit these answers in order:

| answer | expected |
|---|---|
| `deadlock commonly refers mid 0.54` | ~0.5, stays at Remember |
| `A deadlock is a state where each process holds a resource and waits for one held by another.` | ~1.0, Remember → Understand |
| `asdf` | 0.0, Understand → Remember |
| correct twice in a row from Remember | 1st keeps, 2nd promotes (2/2 rule) |

Talking point: “A paraphrase is not a keyword match. Wrong answers score below 40%, the middle
band 40–75% does not move the rung, and promotion needs two consecutive high scores.”

## 5. Submit, results and idempotency (45 seconds)

1. Answer all questions, click **Review and submit → Submit**.
2. Open **Results**: per-question marks, explanation and mastery delta.
3. Double-click Retry or refresh before the network settles: the UI reuses one
   `crypto.randomUUID()` submission key from `sessionStorage`; the server key is
   `(user_id, question_id, submission_id)`. No double marks.

## 6. Failure modes worth showing (45 seconds)

- **Slow network:** Chrome DevTools → Network → Slow 3G, regenerate. Progress is visible and the
  question renders inside the 35 s deadline.
- **LLM blocked:** with the container's `/etc/hosts` pointing
  `generativelanguage.googleapis.com` to `127.0.0.1`, generate still returns a cached/bank question.
  Restore `/etc/hosts` immediately afterwards.
- **DB stopped:** `docker compose stop db`, then generate or submit. The API returns HTTP 503
  `DB_UNAVAILABLE`; the UI shows “The database is temporarily unavailable…” with **Retry**.
  Restart with `docker compose start db`. Never delete volumes.

## Notes for live edits during the demo

If you need to fix any backend Python file mid-demo:
```powershell
# After editing backend code, rerun start-demo.ps1.
cd D:\querymind; .\start-demo.ps1 -Offline   # or -Live
```

## 7. Offline mode (optional final 30 seconds)

```powershell
.\start-demo.ps1 -Offline
curl.exe http://localhost:8000/health
```

Repeat steps 2–5. Expected: deterministic provisional grading, no LLM call, bank/cache fallback,
same real DB writes and same UI. Return to `-Live` with the same script.

## Proof results

| Suite | Result | Screenshot dir |
|-------|--------|----------------|
| uploads (PDF bug) | **PASS offline** | `C:\Users\omsat\AppData\Local\Temp\opencode\qm_e2e_uploads_offline\` |
| novel topic fallback | **PASS offline** | `C:\Users\omsat\AppData\Local\Temp\opencode\qm_e2e_novel_offline\` |
| scorer trust (30 answers) | **30/30 correct, 0 misclassifications** | — |
| middle-band adaptive | **PASS offline** (commit 1d278e2) | `C:\Users\omsat\AppData\Local\Temp\opencode\qm_e2e_middle_offline\` |
| network resilience | **PASS offline** | `C:\Users\omsat\AppData\Local\Temp\opencode\qm_e2e_network_offline\` |
| DB-down 503 | see below | `C:\Users\omsat\AppData\Local\Temp\opencode\qm_e2e_dbdown_offline\` |

Backend tests: 339+ passed. Frontend tests: 343+ passed.

## Rehearsal and backup artifacts

Cold starts were rehearsed 3× (live, live, offline); each started from `docker compose stop` and
a killed Node process, then passed the full browser demo. Logs/screenshots are under
`C:\Users\omsat\AppData\Local\Temp\opencode\` (`qm_cold1_*`, `qm_cold2_*`, `qm_cold3_*`,
`qm_middle_*`, `qm_custom_*`, `qm_network_*`, `qm_dbdown_*`).

Git bundles and source zips (no `.env`, no volumes, no node_modules/venv) are in
`D:\querymind-backup\`. Restore a repo from a bundle with:

```powershell
git clone D:\querymind-backup\querymind-backend-<stamp>.bundle D:\restore\querymind
git clone D:\querymind-backup\querymind-frontend-<stamp>.bundle D:\restore\querymind-frontend
```

## Known demo limitations

- The shipped demo keeps `DEBUG=true` and a default `SECRET_KEY`; production needs real secrets.
- Real Gemini quota exhaustion was not triggered; the LLM endpoint was blocked at DNS level instead.
- Static catalog/content remains local fixtures because the backend has no such router.
- The old `D:\querymind\frontend` tree was not ported; use `D:\querymind-frontend\frontend`.
