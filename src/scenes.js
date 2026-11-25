// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// - `send_command`: press any button of a remote saved in the LOOKin app,
//   including those without a Gladys feature of their own in a scene
//   (separate "on" and "off" buttons, menu, cursor...);
// - `send_ir_code`: send a raw or Pronto HEX code through a LOOKin, for an
//   appliance no saved remote covers.
//
// Failures throw an ActionFailure (shown in red, in the four languages).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async send_command(hub, { fields }) {
    await hub.sendCommand(fields.device, String(fields.command ?? ''));
  },

  async send_ir_code(hub, { fields }) {
    await hub.sendIr(fields.device, String(fields.format ?? ''), fields.code);
  },
};
