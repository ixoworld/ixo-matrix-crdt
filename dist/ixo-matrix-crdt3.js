async function n(i, e, t) {
  try {
    const r = [];
    return r.push({
      type: "m.room.guest_access",
      state_key: "",
      content: {
        guest_access: "forbidden"
      }
    }), r.push({
      type: "m.room.join_rules",
      content: {
        join_rule: t === "public-read-write" ? "public" : "invite"
      }
    }), r.push({
      type: "m.room.history_visibility",
      content: {
        history_visibility: "world_readable"
      }
    }), { status: "ok", roomId: (await i.createRoom({
      room_alias_name: e,
      visibility: "public",
      // Whether this room is visible to the /publicRooms API or not." One of: ["private", "public"]
      name: e,
      topic: "",
      initial_state: r
    })).room_id };
  } catch (r) {
    return r.errcode === "M_ROOM_IN_USE" ? "already-exists" : r.name === "ConnectionError" ? "offline" : {
      status: "error",
      error: r
    };
  }
}
async function s(i, e) {
  let t;
  try {
    t = await i.getStateEvent(e, "m.room.join_rules");
  } catch (r) {
    return {
      status: "error",
      error: r
    };
  }
  if (t.join_rule === "public")
    return "public-read-write";
  if (t.join_rule === "invite")
    return "public-read";
  throw new Error("unsupported join_rule");
}
async function a(i, e, t) {
  try {
    return await i.sendStateEvent(
      e,
      "m.room.join_rules",
      { join_rule: t === "public-read-write" ? "public" : "invite" },
      ""
    ), { status: "ok", roomId: e };
  } catch (r) {
    return r.name === "ConnectionError" ? "offline" : {
      status: "error",
      error: r
    };
  }
}
export {
  n as createMatrixRoom,
  s as getMatrixRoomAccess,
  a as updateMatrixRoomAccess
};
