# file-storage

Where media bytes live, and how they are written.

Path rules are pure functions with no IO; the writing is a thin layer over
`node:fs`. Both are here because they answer the same question, and both are
tested without a running anything.

```bash
npm test
```

## Paths derive from identifiers, not from names

```
antes   contenidos/<estado>/<slug del nombre>/<slug del archivo>.mp4
ahora   contenidos/<mediumId>/<fileId>-<etiqueta>.mp4
```

The legacy editor built the path out of the medium's *name* and *state*.
Renaming a medium therefore rewrote the path of every file it owned, and the
editor copied them on disk to match. With 2.2 GB of video that is minutes of
churn to change a label, plus a window where a crash leaves files in two
places.

`mediumId` is frozen at creation and `fileId` is unique, so the path is stable
for the life of the file. Renaming is now a database update and nothing else.
The trailing label is decoration for whoever is reading a directory listing;
nothing ever parses it back.

## Writing

`writeStreamed` pipes the body to a `.part-<random>` name and renames it into
place, which is atomic on one filesystem. Two consequences worth stating:

- **Nothing accumulates in memory.** The old editor accepted uploads as base64
  inside a JSON body, so a 500 MB video became a ~670 MB string held at once by
  the browser, the request and the server.
- **The destination is complete or absent, never truncated.** A dropped
  connection leaves a `.part` file, not a half video that looks fine in a
  listing and fails on playback.

## Two rules that are easy to skip

**Type comes from the extension.** The legacy editor trusted the browser's
reported MIME type and never rechecked it, so a mislabelled file rendered as
the wrong element in the map with no error anywhere. The extension is what the
`<video>`/`<audio>` tag has to agree with, so it decides.

**Every path is checked before it is resolved.** `isSafeRelativePath` rejects
traversal, absolute paths, drive letters and null bytes, and `resolveInRoot`
checks the resolved path again. Paths come out of the database, which is not
the same as coming from nowhere: a row written by a future bug must not be able
to make the server read `/etc/passwd`.
