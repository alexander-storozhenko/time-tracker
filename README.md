# Time Tracker

A desktop time tracker for people who plan the day as a queue of tasks.
Templates on the left, a dial with today's queue in the middle, today's and
yesterday's numbers on the right. Built with Electron and
[`@morze/ui`](https://www.npmjs.com/package/@morze/ui).

## How it works

**Templates** are the tasks you do again and again — a name, a colour, an
optional icon and an optional time limit. Click or drag one into the **queue**
to plan your day; the same template can go in as many times as you like.

The dial runs one task at a time. With a limit it counts down, without one it
is a stopwatch. Smoke drifting off the dial means the clock is running.

What happens at the limit belongs to the task, not to a settings screen —
different work wants a different answer. **Keep going past the limit**:

| | |
| --- | --- |
| off | the task finishes exactly at the limit and banks the time |
| on | the limit becomes a mark; the clock keeps counting the overtime |

Either way the limit brings one quiet chime and one notification.

Time is banked in **runs** — an unbroken stretch from play to pause or stop.
The statistics are built from runs, so nothing is lost when a task is never
formally finished, and the queue can be cleared without losing history.

## Reports

**Export**, above the statistics, builds a PDF or JSON for any period: tasks,
days, hours, and optionally every run.

The **By hand** tab builds the same report out of lines you type yourself —
for work the tracker never saw. A line is a task, a date and a number of
hours; a colour comes with it, and an icon, a note and a start time are yours
to add if they matter. Reports save under a name and reopen for editing later.

Hand-written lines never become tracked runs. The statistics stay a record of
measured time, not remembered time.

## Shortcuts

| | |
| --- | --- |
| `Space` | start / pause |
| `Ctrl` + `B` | collapse the templates column |
| `Ctrl` + `Shift` + `B` | collapse the statistics column |

## Running it

```bash
npm install
npm run dev        # development, with hot reload
npm run build      # typecheck and build into out/
npm start          # run the built app
npm run dist:linux # package a distributable
```

## Data

Everything lives in one SQLite file in the app's user directory
(`~/.config/time-tracker/time-tracker.db` on Linux); open the folder from
**File → Show data file**. Nothing leaves your machine.
