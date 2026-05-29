const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_API_TOKEN
const projectName = process.env.PROJECT_NAME || 'hermes-painting-landing'
const zoneName = process.env.CLOUDFLARE_ZONE_NAME || 'dottingo.sg'
const target = process.env.CLOUDFLARE_PAGES_TARGET || `${projectName}.pages.dev`
const domains = (process.env.CLOUDFLARE_PAGES_DOMAINS || 'dottingo.sg,www.dottingo.sg')
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean)

if (!accountId || !token) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required')
}

const apiBase = 'https://api.cloudflare.com/client/v4'

async function cf(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok || payload?.success === false) {
    const errors = payload?.errors?.map((error) => `${error.code || 'error'}: ${error.message}`).join('; ')
    throw new Error(`Cloudflare API ${options.method || 'GET'} ${path} failed (${response.status}): ${errors || text}`)
  }
  return payload
}

async function getZoneId() {
  const payload = await cf(`/zones?name=${encodeURIComponent(zoneName)}`)
  const zone = payload.result?.[0]
  if (!zone?.id) throw new Error(`Cloudflare zone not found: ${zoneName}`)
  return zone.id
}

async function ensureDnsRecord(zoneId, domain) {
  const payload = await cf(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}`)
  const records = payload.result || []
  const blocking = records.filter((record) => ['A', 'AAAA', 'CNAME'].includes(record.type) && record.type !== 'CNAME')
  if (blocking.length) {
    throw new Error(`${domain} already has ${blocking.map((record) => record.type).join('/')} DNS record(s). Refusing to overwrite non-CNAME records automatically.`)
  }

  const existing = records.find((record) => record.type === 'CNAME')
  const body = {
    type: 'CNAME',
    name: domain,
    content: target,
    ttl: 1,
    proxied: true,
    comment: `Managed by ${projectName} GitHub Actions`,
  }

  if (existing) {
    if (existing.content === target && existing.proxied === true) {
      console.log(`DNS ok: ${domain} -> ${target}`)
      return
    }
    await cf(`/zones/${zoneId}/dns_records/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    console.log(`DNS updated: ${domain} -> ${target}`)
    return
  }

  await cf(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  console.log(`DNS created: ${domain} -> ${target}`)
}

async function ensurePagesDomain(domain) {
  const list = await cf(`/accounts/${accountId}/pages/projects/${projectName}/domains`)
  const existing = (list.result || []).find((item) => item.name === domain)
  if (existing) {
    console.log(`Pages domain exists: ${domain} (${existing.status || existing.verification_data?.status || 'status unknown'})`)
    return
  }

  const body = { name: domain }
  const created = await cf(`/accounts/${accountId}/pages/projects/${projectName}/domains`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  console.log(`Pages domain added: ${domain} (${created.result?.status || 'pending'})`)
}

const zoneId = await getZoneId()
console.log(`Using Cloudflare zone ${zoneName} (${zoneId})`)

for (const domain of domains) {
  await ensureDnsRecord(zoneId, domain)
  await ensurePagesDomain(domain)
}
