# OrlonDB

Creating a database sounds waaay to complicated, huh? So let's do it :D

As like [Marselo](https://github.com/caiodomingues/marselo), this is a study project, so don't expect it to be production ready or really useful.

- Little to no AI involvement, I want to do most of the work myself to learn as much as possible.
- Key-Value store, no SQL, no relational database; I know it's not the best choice and that relational databases could teach me way more, but I want to start with something simple and "fast".
- The name "Orlon" came from the [story of Poppy](https://universe.leagueoflegends.com/en_US/story/champion/poppy/), the League of Legends champion.

## Map

```plaintext
┌─────────────────────────────┐
│         CLI / REPL          │  <- GET, SET, DEL, EXIT
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│        STORAGE ENGINE       │
│  ┌──────────┐  ┌─────────┐  │
│  │  B+Tree  │  │  Pager  │  │
│  └──────────┘  └─────────┘  │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│   orlon.db  |  orlon.wal    │  <- coming soon
└─────────────────────────────┘
```

## What's built

- **Pages** — fixed-size 4KB blocks with binary serialization/deserialization
- **Pager** — reads and writes pages at exact byte offsets in the file
- **B+ Tree** — insert, search and delete with preventive splits and merge/redistribution on underflow
- **CLI** — a REPL with `GET`, `SET`, `DEL` and `EXIT`

## What's next

- **WAL (Write-Ahead Log)** — durability and crash recovery
- **Buffer pool** — page cache to avoid hitting disk on every read

> When I say "next", I mean some time between tomorrow and 31/12/2999

## Why in TypeScript?

I'm familiar with it :D

## Why another DB?

Go back to the first section and read it again :D
