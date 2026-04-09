# SETON

> [!WARNING] This project is under active development and may change
> significantly. Features, behavior, and documentation may be updated at
> any time.

I like notion, and obsidian and every other note taking app... And to
answer the question that my friend Nikita made:

> Man, are you really one of those guys who is making it's own note taking
> app?
>
> Nikita/2026

Yes, I am... I just really want to have somewhere to add notes, and don't
think about folders or tags, or anything.

I'll just add some `llm` magic to mix this with [another project I
had](https://simple-elegant-web.site/projects/the_opponent_framework/).

## Etimology

So yeah, `SETON` is notes but backward. Yes, I know... I'm really good
naming things.

## How to run this mess

### Development

```bash bun tauri dev ```

### Production?

For "production" I'm currently doing this:

```bash NO_STRIP=true bunx tauri build -b appimage -v ```

Why `NO_STRIP=true`? Honestly... without it, it was not compilying. And
`Claude` told me to add it to make it open, and it did. 

> Stripping removes extra debug information from the final binary, which is
> great when everything is nice and clean, but not that great when you're
> still trying to understand why something exploded. So this keeps more
> information around and makes the build a bit less mysterious.

And `-b appimage` is just because I want an AppImage.

So yeah, "production" exists... but in a very "I built the thing and it
opens" kind of way.

> AFTER BUILD OR DEV STUFF, REMEBER TO DELETE THE COMPILATION FOLDERS...
> THAT SHIT IS LIKE 5GB WTFFFFF

## How to interact with Seton?

Right now the idea is pretty simple: write a note, save it, search it
later, edit it if needed, delete it if it was a terrible thought, and
optionally add some context around it.

The context part currently means things like raw text labels, urls, and
pasted ~or picked images (actually not working)~. Search is there,
multi-select/export is there, and the notes panel is usable enough that I
can pretend this is all very intentional.

The keybindings that are working right now are these:

- `Ctrl+Enter` / `Cmd+Enter` saves the current note when the editor is
  focused.
- `Escape` blurs the current input/editor. If you're not inside an input,
  it jumps focus back to the center panel.
- `ArrowUp`, `ArrowLeft`, `ArrowRight`, `ArrowDown` move between the main
  app regions when you're not typing inside an input/editor.
- In the notes search input, `ArrowDown` / `ArrowUp` move through results
  and `Enter` opens the selected note.
- In the context input, `ArrowLeft` / `ArrowRight` move through suggestions
  and `Enter` picks the current suggestion, or creates the raw context if
  there is no active suggestion.

> I really need to work better on the `UX` of this stuff

## What is missing

A lot of polish, basically.

There is still a bunch of stuff missing around making this feel reliable,
finished, and less like a personal lab experiment with a UI. Better
onboarding, better error states, clearer workflows, more confidence around
the build story.

Also, if you find something broken, confusing, or just weird in a
suspicious way, please open an issue. That would help a lot, and it is
probably more useful than me pretending I already noticed it.
