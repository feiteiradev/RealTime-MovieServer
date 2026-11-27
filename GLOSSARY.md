# Campfire

A self-hosted app where a small group of invited people watch or listen to the same media at the same moment, each from their own browser.

## People

**Host**:
The Viewer who runs the server on their own computer and shares the Room's link; they have no extra powers in the Room.
_Avoid_: Admin, owner, server

**Viewer**:
Anyone in the Room, including the Host, identified only by a Nickname.
_Avoid_: User, member, participant, guest

**Nickname**:
The name a Viewer types on joining; there are no accounts or passwords.
_Avoid_: Username, account

## Room

**Room**:
The single shared space a running server offers, reachable by its link.
_Avoid_: Lobby, session, party

**Media Item**:
The one thing the Room is currently playing; adding a new one replaces it.
_Avoid_: Video, track, content

**Source**:
Where a Media Item comes from: YouTube, Local File, SoundCloud or Direct Link.
_Avoid_: Provider, platform

**Local File**:
A Media Item that each Viewer opens from their own disk; only the timing is shared, never the file.
_Avoid_: Upload, stream

**Activity Feed**:
The running list of who did what in the Room, such as "Ana paused at 12:04".
_Avoid_: Chat, log

## Playback

**Playback State**:
The Room's single shared truth about the Media Item: playing or paused, position and speed.
_Avoid_: Player state, sync state

**Drift**:
How far one Viewer's player is from where the Playback State says it should be.
_Avoid_: Lag, desync

**Shared Control**:
A playback action any Viewer can take that applies to everyone: play, pause, seek or speed. Volume is never a Shared Control.
_Avoid_: Host control, remote
