import { expect, test } from 'claude-code/testing'

const footer = (modes: readonly string[]) =>
  ({ plugin: 'cache-band', component: 'SessionMode', props: { modes } }) as const

test('the footer shows the capsule and keeps the engine mode labels, on every surface', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...footer(['focus', 'memory paused']), surface })

    expect((await ui.find({ type: 'Text', text: /▱/ }))?.text).toBe('▱▱▱▱▱▱')
    expect((await ui.find({ type: 'Text', text: /focus/ }))?.text).toBe('focus & memory paused')
    await ui.unmount()
  }
})
