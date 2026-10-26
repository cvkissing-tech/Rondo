import { writeFile } from 'node:fs/promises'

// Electron's native capture keeps automated windows hidden from the user's desktop.
export async function capture(app, page, { path }) {
  await page.addStyleTag({
    content:
      '*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important}'
  })
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
  const window = await app.browserWindow(page)
  const png = await window.evaluate(async (w) => {
    const image = await w.capturePage(undefined, { stayHidden: true, stayAwake: true })
    return image.toPNG().toString('base64')
  })
  await writeFile(path, Buffer.from(png, 'base64'))
}
