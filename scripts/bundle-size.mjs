import { basename } from 'node:path'

function attribute(tag, name) {
  return new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(tag)?.[1]
}

function localAssetName(url) {
  const pathname = new URL(url, 'https://bundle.local').pathname
  return pathname.startsWith('/assets/') ? basename(pathname) : null
}

export function initialAssetNames(html, kind) {
  const urls = []

  if (kind === 'js') {
    for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
      if (attribute(tag, 'type') === 'module') urls.push(attribute(tag, 'src'))
    }
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      if (attribute(tag, 'rel') === 'modulepreload') urls.push(attribute(tag, 'href'))
    }
  } else {
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      if (attribute(tag, 'rel') === 'stylesheet') urls.push(attribute(tag, 'href'))
    }
  }

  return [...new Set(urls.map(url => url && localAssetName(url)).filter(Boolean))]
}
