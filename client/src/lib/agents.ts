import axios from 'axios'

export type Agent = { id: string; name: string }

export async function fetchAgents() {
  const { data } = await axios.get<{ users: { id: string; name: string; role: 'ADMIN' | 'AGENT' }[] }>(
    '/api/users',
    { withCredentials: true },
  )
  return data.users.filter((user): user is Agent & { role: 'AGENT' } => user.role === 'AGENT')
}
