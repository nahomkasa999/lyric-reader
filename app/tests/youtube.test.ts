// The YouTube link reader: what people paste, and what it means.
// These are the numbers the player is driven with, so they are pinned here.
import { describe, it, expect } from "vitest";
import {
  parseYouTubeId,
  parseYouTubeLinks,
  parseYouTubePlaylistId,
  parseYouTubeRef,
  youtubeEmbedUrl,
  youtubePlaylistEmbedUrl,
} from "../src/lib/youtube";
import {
  parseYouTubeMessage,
  youtubeCommand,
  youtubeErrorText,
  youtubeListening,
} from "../src/lib/youtubeWire";
import {
  addTrack,
  makeTrack,
  removeTrack,
  shortLink,
  stepIndex,
  trackUrl,
} from "../src/lib/youtubePlaylist";

const ID = "dQw4w9WgXcQ";

describe("the video id inside a link", () => {
  it("reads the shapes people paste", () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeId(ID)).toBe(ID);
  });

  it("ignores what is not a video", () => {
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("   ")).toBeNull();
    expect(parseYouTubeId("hello")).toBeNull();
    expect(parseYouTubeId("https://vimeo.com/12345")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/playlist?list=PLabc")).toBe(
      null,
    );
    // Ten characters is not an id; twelve is not either.
    expect(parseYouTubeId("abcdefghij")).toBeNull();
    expect(parseYouTubeId("abcdefghijkl")).toBeNull();
  });
});

describe("the playlist id inside a link", () => {
  const LIST = "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf";

  it("reads the playlist links", () => {
    expect(
      parseYouTubePlaylistId(`https://www.youtube.com/playlist?list=${LIST}`),
    ).toBe(LIST);
    expect(
      parseYouTubePlaylistId(`https://www.youtube.com/watch?v=${ID}&list=${LIST}`),
    ).toBe(LIST);
    expect(parseYouTubePlaylistId(LIST)).toBe(LIST);
  });

  it("does not mistake a video for a playlist", () => {
    expect(parseYouTubePlaylistId(ID)).toBeNull();
    expect(parseYouTubePlaylistId(`https://youtu.be/${ID}`)).toBeNull();
    expect(parseYouTubePlaylistId("https://example.com/list?list=PLabc")).toBe(
      null,
    );
  });
});

describe("a pasted link", () => {
  it("knows a video from a playlist", () => {
    const v = parseYouTubeRef(`https://www.youtube.com/watch?v=${ID}`);
    expect(v.videoId).toBe(ID);
    expect(v.playlistId).toBeNull();

    const p = parseYouTubeRef(
      "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    );
    expect(p.videoId).toBeNull();
    expect(p.playlistId).toBe("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf");
  });

  it("reads every link in a blob of text", () => {
    const refs = parseYouTubeLinks(
      `https://youtu.be/${ID}\nhttps://www.youtube.com/watch?v=aaaaaaaaaaa`,
    );
    expect(refs).toHaveLength(2);
    expect(refs[0].videoId).toBe(ID);
    expect(refs[1].videoId).toBe("aaaaaaaaaaa");
  });

  it("ignores the words around the links", () => {
    expect(parseYouTubeLinks("listen to this https://youtu.be/" + ID)).toHaveLength(
      1,
    );
    expect(parseYouTubeLinks("no links here")).toHaveLength(0);
  });
});

describe("the embed", () => {
  it("is a plain iframe that listens to commands", () => {
    const url = youtubeEmbedUrl(ID, { autoplay: true });
    expect(url).toContain(`youtube-nocookie.com/embed/${ID}`);
    expect(url).toContain("enablejsapi=1");
    // No picture, no picture-in-picture, no suggestions.
    expect(url).toContain("controls=0");
    expect(url).toContain("autoplay=1");
  });

  it("plays a whole playlist on its own", () => {
    const url = youtubePlaylistEmbedUrl("PLabc", { autoplay: true });
    expect(url).toContain("embed/videoseries");
    expect(url).toContain("list=PLabc");
    expect(url).toContain("enablejsapi=1");
  });
});

describe("the wire", () => {
  it("greets the player and asks it things", () => {
    const hello = JSON.parse(youtubeListening());
    expect(hello.event).toBe("listening");
    expect(hello.channel).toBe("widget");

    const cmd = JSON.parse(youtubeCommand("playVideo"));
    expect(cmd.event).toBe("command");
    expect(cmd.func).toBe("playVideo");
    expect(cmd.args).toEqual([]);
  });

  it("reads the player's own messages", () => {
    const msg = parseYouTubeMessage(
      JSON.stringify({
        event: "infoDelivery",
        id: "ytp",
        info: { playerState: 1, currentTime: 12.5, duration: 210 },
      }),
    );
    expect(msg?.event).toBe("infoDelivery");
    expect(msg?.info?.playerState).toBe(1);
    expect(msg?.info?.currentTime).toBe(12.5);
  });

  it("ignores everything that is not the player", () => {
    expect(parseYouTubeMessage("not json")).toBeNull();
    expect(parseYouTubeMessage(42)).toBeNull();
    expect(parseYouTubeMessage(JSON.stringify({ event: "command" }))?.info).toBe(
      undefined,
    );
  });

  it("says what the player's own errors mean", () => {
    expect(youtubeErrorText({ errorCode: 100 })).toContain("gone or private");
    expect(youtubeErrorText({ errorCode: 150 })).toContain("does not allow");
    expect(youtubeErrorText(null)).toContain("would not play");
  });
});

describe("the list of links", () => {
  const a = makeTrack("aaaaaaaaaaa", undefined, "First", 1);
  const b = makeTrack("bbbbbbbbbbb", undefined, "Second", 2);

  it("keeps the newest first and one entry per video", () => {
    let list = addTrack([], a);
    list = addTrack(list, b);
    expect(list.map((t) => t.id)).toEqual([b.id, a.id]);
    // The same link again moves back to the top, without a copy.
    list = addTrack(list, { ...a, addedAt: 3 });
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(a.id);
  });

  it("never loses a title it already knows", () => {
    const list = addTrack(addTrack([], a), {
      ...a,
      title: null,
      addedAt: 9,
    });
    expect(list[0].title).toBe("First");
  });

  it("takes a link out", () => {
    const list = addTrack(addTrack([], a), b);
    expect(removeTrack(list, a.id).map((t) => t.id)).toEqual([b.id]);
  });

  it("walks a list and wraps around it", () => {
    const list = [a, b];
    expect(stepIndex(list, 0, 1)).toBe(1);
    expect(stepIndex(list, 1, 1)).toBe(0);
    expect(stepIndex(list, 0, -1)).toBe(1);
    expect(stepIndex([], 0, 1)).toBe(-1);
  });

  it("shortens a link for a row with no title", () => {
    expect(shortLink(trackUrl("abcdefghijk"))).toBe("abcdefghijk");
    expect(shortLink("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
  });
});
