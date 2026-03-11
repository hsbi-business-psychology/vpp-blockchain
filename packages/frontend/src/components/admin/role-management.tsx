import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ethers } from 'ethers'
import { UserPlus, UserMinus, Loader2, Info, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SURVEY_POINTS_ABI } from '@/lib/contract-abi'

interface RoleManagementProps {
  walletAddress: string
  signer: ethers.Signer
}

export function RoleManagement({ walletAddress, signer }: RoleManagementProps) {
  const { t } = useTranslation()
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [admins, setAdmins] = useState<string[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(true)

  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS || ''
  const rpcUrl = import.meta.env.VITE_RPC_URL || ''

  const fetchAdmins = useCallback(async () => {
    if (!contractAddress || !rpcUrl) return
    setLoadingAdmins(true)
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl)
      const contract = new ethers.Contract(contractAddress, SURVEY_POINTS_ABI, provider)
      const adminRole = await contract.ADMIN_ROLE()

      const grantedFilter = contract.filters.RoleGranted(adminRole)
      const revokedFilter = contract.filters.RoleRevoked(adminRole)

      const [grantedEvents, revokedEvents] = await Promise.all([
        contract.queryFilter(grantedFilter),
        contract.queryFilter(revokedFilter),
      ])

      const adminSet = new Set<string>()
      const allEvents = [
        ...grantedEvents.map((e) => ({ type: 'grant' as const, ...e })),
        ...revokedEvents.map((e) => ({ type: 'revoke' as const, ...e })),
      ].sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index)

      for (const event of allEvents) {
        if (!('args' in event)) continue
        const account = (event.args as unknown as [string, string, string])[1]
        if (event.type === 'grant') {
          adminSet.add(account)
        } else {
          adminSet.delete(account)
        }
      }

      setAdmins(Array.from(adminSet))
    } catch (err) {
      console.error('Failed to fetch admins:', err)
    } finally {
      setLoadingAdmins(false)
    }
  }, [contractAddress, rpcUrl])

  useEffect(() => {
    fetchAdmins()
  }, [fetchAdmins])

  const handleAddAdmin = async () => {
    if (!ethers.isAddress(address)) {
      toast.error(t('admin.roles.errorAdd'))
      return
    }
    setLoading(true)
    try {
      const contract = new ethers.Contract(contractAddress, SURVEY_POINTS_ABI, signer)
      const tx = await contract.addAdmin(address)
      await tx.wait()
      toast.success(t('admin.roles.successAdd'))
      setAddress('')
      await fetchAdmins()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.roles.errorAdd'))
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveAdmin = async (addr: string) => {
    setLoading(true)
    try {
      const contract = new ethers.Contract(contractAddress, SURVEY_POINTS_ABI, signer)
      const tx = await contract.removeAdmin(addr)
      await tx.wait()
      toast.success(t('admin.roles.successRemove'))
      await fetchAdmins()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.roles.errorRemove'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">{t('admin.roles.title')}</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground">
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-sm">
                {t('admin.roles.infoTip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <CardDescription>{t('admin.roles.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder={t('admin.roles.placeholder')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="font-mono sm:flex-1"
          />
          <div className="flex gap-2">
            <Button onClick={handleAddAdmin} disabled={loading || !address} className="flex-1 sm:flex-none">
              {loading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 size-4" />
              )}
              {t('admin.roles.addAdmin')}
            </Button>
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-muted-foreground">
            {t('admin.roles.currentAdmins')}
          </h4>
          {loadingAdmins ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('admin.roles.checking')}
            </div>
          ) : admins.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t('admin.roles.noAdmins')}</p>
          ) : (
            <div className="space-y-2">
              {admins.map((addr) => (
                <div
                  key={addr}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ShieldCheck className="size-4 shrink-0 text-primary" />
                    <span className="truncate font-mono text-sm">{addr}</span>
                    {addr.toLowerCase() === walletAddress.toLowerCase() && (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {t('admin.roles.you')}
                      </Badge>
                    )}
                  </div>
                  {addr.toLowerCase() !== walletAddress.toLowerCase() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAdmin(addr)}
                      disabled={loading}
                      className="shrink-0 text-destructive hover:text-destructive"
                    >
                      <UserMinus className="mr-1 size-4" />
                      {t('admin.roles.removeAdmin')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
