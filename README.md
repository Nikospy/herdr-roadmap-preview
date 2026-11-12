# herdr-roadmap-preview

**See where your project stands without asking an agent.** A [Herdr](https://herdr.dev) mod that draws a 10x roadmap as a map: one click opens it over the whole window, zoomable, for the project you're working in.

![Roadmap Preview](roadmap-preview/preview.png)

When several agents plan, build and archive work from one roadmap file, the file is the truth, but nobody reads a 600-line markdown file to find out what's next. This pane reads it for you and keeps redrawing as the agents tick things off:

- **What's happening now**: items in progress, with the agent's note (`claude, phase 2 of 3`).
- **What can start**: items whose prerequisites are all done.
- **What's blocked, and by what**: a dashed line means "still waiting for this one".
- **Where the records disagree**: the roadmap's table says one thing and the item's own status another, or a milestone was closed while an item was still open. The item's id gets a red mark. These are the places where an agent ticked something off wrong, or forgot to.
- **The whole road**: closed milestones fold to dots. Click one and it unfolds in place, rebuilt from the roadmap's git history.

![A closed milestone, unfolded](roadmap-preview/unfolded.png)

## Reading the map

| Mark | Means |
|---|---|
| green dot | done |
| blue dot with a ring | in progress |
| bright ring | ready to start: every prerequisite is done |
| dim ring | waiting: a prerequisite isn't done yet |
| dim square | parked |
| solid line | the requirement is met |
| dashed line | the requirement still blocks the item on the right |
| red bar beside an id | the records about this item disagree |

## What it reads

The roadmap format of the [10xDevs](https://10xdevs.pl) course workflow (`/10x-roadmap`, then `/10x-plan`, `/10x-implement` and `/10x-archive`, which flip item statuses as work moves):

- `context/foundation/roadmap.md`, with `milestone_seq` and `milestone_status` in the front matter;
- the **At a glance** table (`ID`, `Prerequisites`, `Status`) and each item's `### S-12: Title` section with its `- **Status:**` line;
- `## Slices of M-4 (queued)` for a queued milestone, `## Milestone History` for closed ones;
- for closed milestones, the roadmap's git history: the last version of the file before `milestone_seq` moved on.

Notes in a status are kept: `in-progress (claude, phase 2 of 3)` shows "claude, phase 2 of 3" under the station.

## Install

```sh
git clone https://github.com/Nikospy/herdr-roadmap-preview
cp -R herdr-roadmap-preview/roadmap-preview/mods/roadmap-preview ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/roadmap-preview
```

Open it over the whole window, for the project of the focused terminal (again, or Esc, closes it):

```sh
herdr-app do mod.open --name roadmap-preview
```

Or as a pane beside a terminal: `herdr-app do pane.split '{"direction":"right","mod":"roadmap-preview"}'`.

Or point it at a project: `herdr-app do roadmap-preview.open:/path/to/project`.

No roadmap at hand? Build a demo project with three milestones and a git history:

```sh
bash herdr-roadmap-preview/example/make-demo.sh /tmp/roadmap-demo
herdr-app do mod.open --name roadmap-preview
herdr-app do roadmap-preview.open:/tmp/roadmap-demo
```

## Zoom and move

- **cmd/ctrl + scroll** zooms around the pointer (30 % to 300 %); the header has **−**, the zoom level (click: 100 %), **+** and **Fit**.
- **Scroll** or **drag** moves around the map; the arrow keys too.
- Keys: `+` and `-` zoom, `0` fits, `1` goes back to 100 %.
- It opens fitted: the whole map in view, between 60 % and 160 %; a map still too wide starts at the open milestone.

## A Roadmap button next to Files and Changes

The Files and Changes buttons live in the tab bar mod. Clone it (`herdr-app do mod.clone '{"name":"tabs","as":"my-tabs"}'`, then point your layout's tab bar at `my-tabs`) and add a button after the Changes one:

```js
.child(h_flex().id("open-roadmap").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
  .text_size(12).bg(t.chrome).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
  .on_mouse_down("left", stop)
  .on_click(() => run("mod.open", { name: "roadmap-preview" }))
  .child(svg("mods/roadmap-preview/roadmap.svg").size(14)).child("Roadmap"))
```

It can also sit in a layout as a side panel: a block with `{ "mod": "roadmap-preview", "props": { "role": "panel" } }`, which follows the project you're in.

## Commands

| Command | Does |
|---|---|
| `roadmap-preview.open:<file or folder>` | show another roadmap |
| `roadmap-preview.unfold:<n>` | unfold closed milestone M-n |
| `roadmap-preview.fold:<n>` | fold it again |
| `roadmap-preview.zoom:in`, `zoom:out`, `zoom:fit`, `zoom:1` | zoom |
| `roadmap-preview.follow` | (side panel) go back to following the project you're in |

## Good to know

- It only reads: the roadmap file and `git` in the roadmap's repository. It never writes.
- Colors come from your Herdr theme (green, blue and red are the theme's ANSI 2, 4 and 1).
- Lines are horizontal and vertical only: Herdr mods draw boxes, not paths. Zoom redraws every size times the zoom, since mods have no transforms.
- The full build brief, for an agent rebuilding or changing it, is in [RECIPE.md](roadmap-preview/RECIPE.md).

## Credits

The roadmap format and the plan → implement → archive loop come from the 10xDevs course by [Przeprogramowani](https://przeprogramowani.pl). This mod only reads it.

## License

MIT
