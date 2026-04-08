# Media Resource Management

**English** | [简体中文](README.zh-CN.md)

A local-first workspace for reviewing, organizing, and reconciling large photo and media libraries.

This project is designed for people who deal with big batches of exported files and need a faster way to understand what is already connected, what still needs attention, and where each asset came from.

![Media Resource Management workspace](docs/assets/media-resource-management-screenshot.png)

## What the product does

Media Resource Management helps you:

- bring processed media into one visual workspace
- separate **matched** and **unmatched** assets at a glance
- review large libraries quickly in a dense browser layout
- inspect previews and file details without leaving the workspace
- keep separate catalogs for different jobs, clients, or review sessions

## Typical use cases

This product is a good fit for:

- photographers managing RAW files and exported JPGs
- editors reviewing large delivery folders
- studios cleaning up import workflows after export
- creative teams who want a calmer, more visual alternative to folder-by-folder checking

## Typical workflow

1. Open or create a catalog for a project.
2. Add source media and processed exports.
3. Let the workspace organize and surface likely relationships.
4. Browse everything in one place.
5. Focus on the assets that still need review, confirmation, or cleanup.

## Current experience

The current desktop experience is centered on fast visual review:

- **All Assets** view for the full library
- **Matched** and **Unmatched** views for quick triage
- a large gallery for scanning many images quickly
- a right-hand inspector for preview, dimensions, file type, and source details
- a local catalog-based workflow so each workspace stays self-contained

## Why local-first matters

Your media stays tied to your own storage and working environment.

That means the product is aimed at people who care about:

- keeping source files on their own drives
- working with existing folder structures
- avoiding unnecessary cloud complexity during review
- maintaining a clear review workspace without moving everything into a new system first

## What this repository contains

This repository includes the product work behind that experience:

- the desktop review app
- catalog and workspace examples
- import and matching services
- supporting docs, design exploration, and tests

## Project status

This is an early but usable product direction focused on one core promise:

**make large media libraries easier to review, reconcile, and trust.**

The current scope is intentionally narrow. It prioritizes browsing, matching, and inspection before expanding into broader workflow or collaboration features.

---

If you are looking for implementation notes or deeper technical details, see [docs/developer-setup.md](docs/developer-setup.md).
