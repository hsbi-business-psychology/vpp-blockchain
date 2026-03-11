import { useTranslation } from 'react-i18next'
import {
  FileText,
  ArrowRight,
  Wallet,
  PenTool,
  Server,
  Blocks,
  Hash,
  KeyRound,
  Lock,
  Unlock,
  Layers,
  ShieldCheck,
  Users,
  Coins,
} from 'lucide-react'

function DiagramBox({
  icon: Icon,
  label,
  color = 'primary',
}: {
  icon: React.ElementType
  label: string
  color?: string
}) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  }
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 ${
        colorMap[color] || colorMap.primary
      }`}
    >
      <Icon className="size-5" />
      <span className="text-center text-xs font-medium leading-tight">{label}</span>
    </div>
  )
}

function DiagramArrow() {
  return <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
}

function ClaimFlowDiagram() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-center text-sm font-semibold">{t('docs.diagrams.claimFlow')}</h3>
      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
        <DiagramBox icon={FileText} label="SoSci Survey" color="violet" />
        <DiagramArrow />
        <DiagramBox icon={Wallet} label="Wallet" color="primary" />
        <DiagramArrow />
        <DiagramBox icon={PenTool} label={t('docs.diagrams.sign')} color="amber" />
        <DiagramArrow />
        <DiagramBox icon={Server} label="Backend" color="sky" />
        <DiagramArrow />
        <DiagramBox icon={Blocks} label="Blockchain" color="emerald" />
      </div>
    </div>
  )
}

function BlockchainChainDiagram() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-center text-sm font-semibold">
        {t('docs.diagrams.blockchainChain')}
      </h3>
      <div className="flex items-stretch justify-center gap-1 overflow-x-auto md:gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1 md:gap-2">
            <div className="flex flex-col items-center rounded-lg border border-primary/20 bg-primary/5 p-2.5 md:p-3">
              <span className="text-[10px] font-bold text-primary">Block {i}</span>
              <Hash className="my-1 size-4 text-primary/60" />
              <span className="font-mono text-[9px] text-muted-foreground">
                {i === 0 ? '0x000...' : `0x${(i * 3 + 7).toString(16)}a${i}...`}
              </span>
              <div className="mt-1 rounded bg-muted px-1.5 py-0.5 text-[9px]">TX Data</div>
            </div>
            {i < 3 && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        {t('docs.diagrams.blockchainCaption')}
      </p>
    </div>
  )
}

function PublicPrivateKeyDiagram() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-center text-sm font-semibold">{t('docs.diagrams.keyPair')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <Unlock className="size-5 text-emerald-600 dark:text-emerald-400" />
            <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Public Key
            </h4>
          </div>
          <p className="font-mono text-xs text-muted-foreground">0x71C7...4Fe2</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>{t('docs.diagrams.publicKeyDesc1')}</li>
            <li>{t('docs.diagrams.publicKeyDesc2')}</li>
          </ul>
        </div>
        <div className="space-y-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2">
            <Lock className="size-5 text-red-500" />
            <h4 className="text-sm font-semibold text-red-500">Private Key</h4>
          </div>
          <p className="font-mono text-xs text-muted-foreground">••••••••••••••••</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>{t('docs.diagrams.privateKeyDesc1')}</li>
            <li>{t('docs.diagrams.privateKeyDesc2')}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function Layer2Diagram() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-center text-sm font-semibold">{t('docs.diagrams.layer2')}</h3>
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full max-w-sm items-center justify-center gap-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
          <Layers className="size-5 text-sky-500" />
          <div>
            <p className="text-sm font-semibold text-sky-600 dark:text-sky-400">Base (Layer 2)</p>
            <p className="text-[11px] text-muted-foreground">{t('docs.diagrams.l2Desc')}</p>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="h-6 w-px bg-border" />
          <span className="text-[10px] text-muted-foreground">{t('docs.diagrams.rollup')}</span>
          <div className="h-6 w-px bg-border" />
        </div>
        <div className="flex w-full max-w-sm items-center justify-center gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
          <Blocks className="size-5 text-violet-500" />
          <div>
            <p className="text-sm font-semibold text-violet-600 dark:text-violet-400">
              Ethereum (Layer 1)
            </p>
            <p className="text-[11px] text-muted-foreground">{t('docs.diagrams.l1Desc')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SmartContractDiagram() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-center text-sm font-semibold">{t('docs.diagrams.smartContract')}</h3>
      <div className="mx-auto max-w-sm space-y-3">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
          <p className="text-sm font-semibold text-primary">SurveyPoints Contract</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-md bg-muted p-2">
            <ShieldCheck className="size-3.5 text-amber-500" />
            <span className="text-xs">ADMIN_ROLE</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted p-2">
            <KeyRound className="size-3.5 text-emerald-500" />
            <span className="text-xs">MINTER_ROLE</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['registerSurvey', 'awardPoints', 'deactivate'].map((fn) => (
            <div key={fn} className="rounded-md bg-muted p-2 text-center">
              <span className="font-mono text-[10px]">{fn}()</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-md bg-muted p-2">
            <Users className="size-3.5 text-primary" />
            <span className="text-xs">{t('docs.diagrams.surveys')}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted p-2">
            <Coins className="size-3.5 text-primary" />
            <span className="text-xs">{t('docs.diagrams.points')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const DIAGRAMS: Record<string, React.FC> = {
  'claim-flow': ClaimFlowDiagram,
  'blockchain-chain': BlockchainChainDiagram,
  'public-private-key': PublicPrivateKeyDiagram,
  'layer-2': Layer2Diagram,
  'smart-contract': SmartContractDiagram,
}

export function DocsDiagram({ diagramId }: { diagramId: string }) {
  const Diagram = DIAGRAMS[diagramId]
  if (!Diagram) return null
  return <Diagram />
}
