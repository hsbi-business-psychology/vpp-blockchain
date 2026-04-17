import { expect } from 'chai'
import { ethers, upgrades } from 'hardhat'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import type { SurveyPointsV2 } from '../typechain-types'

describe('SurveyPointsV2', () => {
  let contract: SurveyPointsV2
  let admin: HardhatEthersSigner
  let minter: HardhatEthersSigner
  let admin2: HardhatEthersSigner
  let student1: HardhatEthersSigner
  let student2: HardhatEthersSigner
  let outsider: HardhatEthersSigner

  const SURVEY_ID = 1
  const SURVEY_POINTS = 2
  const MAX_CLAIMS = 100
  const SURVEY_TITLE = 'Test Survey Alpha'

  beforeEach(async () => {
    ;[admin, minter, admin2, student1, student2, outsider] = await ethers.getSigners()

    const factory = await ethers.getContractFactory('SurveyPointsV2')
    const proxy = await upgrades.deployProxy(factory, [admin.address, minter.address], {
      kind: 'uups',
      initializer: 'initialize',
    })
    await proxy.waitForDeployment()
    contract = proxy as unknown as SurveyPointsV2
  })

  // -------------------------------------------------------------------
  //  Initialization & roles
  // -------------------------------------------------------------------

  describe('Initialization', () => {
    it('assigns DEFAULT_ADMIN_ROLE to the admin', async () => {
      const role = await contract.DEFAULT_ADMIN_ROLE()
      expect(await contract.hasRole(role, admin.address)).to.equal(true)
    })

    it('assigns ADMIN_ROLE to the admin', async () => {
      expect(await contract.isAdmin(admin.address)).to.equal(true)
    })

    it('assigns MINTER_ROLE to the minter', async () => {
      const role = await contract.MINTER_ROLE()
      expect(await contract.hasRole(role, minter.address)).to.equal(true)
    })

    it('exposes a semantic version string', async () => {
      expect(await contract.version()).to.equal('2.0.0')
    })

    it('rejects re-initialization', async () => {
      await expect(
        contract.initialize(admin.address, minter.address),
      ).to.be.revertedWithCustomError(contract, 'InvalidInitialization')
    })

    it('reverts when admin is zero', async () => {
      const factory = await ethers.getContractFactory('SurveyPointsV2')
      await expect(
        upgrades.deployProxy(factory, [ethers.ZeroAddress, minter.address], {
          kind: 'uups',
          initializer: 'initialize',
        }),
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress')
    })

    it('reverts when minter is zero', async () => {
      const factory = await ethers.getContractFactory('SurveyPointsV2')
      await expect(
        upgrades.deployProxy(factory, [admin.address, ethers.ZeroAddress], {
          kind: 'uups',
          initializer: 'initialize',
        }),
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress')
    })
  })

  // -------------------------------------------------------------------
  //  Survey lifecycle
  // -------------------------------------------------------------------

  describe('registerSurvey', () => {
    it('registers a survey without storing any secret', async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.points).to.equal(SURVEY_POINTS)
      expect(info.maxClaims).to.equal(MAX_CLAIMS)
      expect(info.claimCount).to.equal(0)
      expect(info.active).to.equal(true)
      expect(info.title).to.equal(SURVEY_TITLE)
    })

    it('emits SurveyRegistered with the survey title', async () => {
      await expect(
        contract.connect(admin).registerSurvey(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE),
      )
        .to.emit(contract, 'SurveyRegistered')
        .withArgs(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
    })

    it('reverts on duplicate registration', async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
      await expect(
        contract.connect(admin).registerSurvey(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE),
      ).to.be.revertedWithCustomError(contract, 'SurveyAlreadyExists')
    })

    it('reverts on surveyId == 0', async () => {
      await expect(
        contract.connect(admin).registerSurvey(0, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE),
      ).to.be.revertedWithCustomError(contract, 'InvalidSurveyId')
    })

    it('reverts on points == 0', async () => {
      await expect(
        contract.connect(admin).registerSurvey(SURVEY_ID, 0, MAX_CLAIMS, SURVEY_TITLE),
      ).to.be.revertedWithCustomError(contract, 'InvalidPoints')
    })

    it('rejects non-admin callers', async () => {
      await expect(
        contract
          .connect(outsider)
          .registerSurvey(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE),
      ).to.be.reverted
    })
  })

  // -------------------------------------------------------------------
  //  awardPoints (no more secret param)
  // -------------------------------------------------------------------

  describe('awardPoints', () => {
    beforeEach(async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
    })

    it('awards points without requiring a secret', async () => {
      await contract.connect(minter).awardPoints(student1.address, SURVEY_ID)

      expect(await contract.totalPoints(student1.address)).to.equal(SURVEY_POINTS)
      expect(await contract.surveyPoints(student1.address, SURVEY_ID)).to.equal(SURVEY_POINTS)
      expect(await contract.claimed(student1.address, SURVEY_ID)).to.equal(true)
    })

    it('emits PointsAwarded', async () => {
      await expect(contract.connect(minter).awardPoints(student1.address, SURVEY_ID))
        .to.emit(contract, 'PointsAwarded')
        .withArgs(student1.address, SURVEY_ID, SURVEY_POINTS)
    })

    it('rejects non-minter callers', async () => {
      await expect(contract.connect(outsider).awardPoints(student1.address, SURVEY_ID)).to.be
        .reverted
    })

    it('reverts on double claim', async () => {
      await contract.connect(minter).awardPoints(student1.address, SURVEY_ID)
      await expect(
        contract.connect(minter).awardPoints(student1.address, SURVEY_ID),
      ).to.be.revertedWithCustomError(contract, 'AlreadyClaimed')
    })

    it('reverts on missing survey', async () => {
      await expect(
        contract.connect(minter).awardPoints(student1.address, 999),
      ).to.be.revertedWithCustomError(contract, 'SurveyNotFound')
    })

    it('reverts on inactive survey', async () => {
      await contract.connect(admin).deactivateSurvey(SURVEY_ID)
      await expect(
        contract.connect(minter).awardPoints(student1.address, SURVEY_ID),
      ).to.be.revertedWithCustomError(contract, 'SurveyNotActive')
    })

    it('reverts on student address zero', async () => {
      await expect(
        contract.connect(minter).awardPoints(ethers.ZeroAddress, SURVEY_ID),
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress')
    })

    it('honours the maxClaims cap', async () => {
      const limited = 99
      await contract.connect(admin).registerSurvey(limited, SURVEY_POINTS, 2, 'Limited')
      await contract.connect(minter).awardPoints(student1.address, limited)
      await contract.connect(minter).awardPoints(student2.address, limited)
      await expect(
        contract.connect(minter).awardPoints(outsider.address, limited),
      ).to.be.revertedWithCustomError(contract, 'MaxClaimsReached')
    })
  })

  // -------------------------------------------------------------------
  //  revokePoints (NEW)
  // -------------------------------------------------------------------

  describe('revokePoints', () => {
    beforeEach(async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
      await contract.connect(minter).awardPoints(student1.address, SURVEY_ID)
    })

    it('reverses a previously awarded claim', async () => {
      await contract.connect(admin).revokePoints(student1.address, SURVEY_ID)

      expect(await contract.totalPoints(student1.address)).to.equal(0)
      expect(await contract.surveyPoints(student1.address, SURVEY_ID)).to.equal(0)
      expect(await contract.claimed(student1.address, SURVEY_ID)).to.equal(false)
    })

    it('decrements the survey claim counter', async () => {
      const before = (await contract.getSurveyInfo(SURVEY_ID)).claimCount
      await contract.connect(admin).revokePoints(student1.address, SURVEY_ID)
      const after = (await contract.getSurveyInfo(SURVEY_ID)).claimCount
      expect(after).to.equal(before - 1n)
    })

    it('emits PointsRevoked with the original points', async () => {
      await expect(contract.connect(admin).revokePoints(student1.address, SURVEY_ID))
        .to.emit(contract, 'PointsRevoked')
        .withArgs(student1.address, SURVEY_ID, SURVEY_POINTS, admin.address)
    })

    it('allows re-claiming after revocation', async () => {
      await contract.connect(admin).revokePoints(student1.address, SURVEY_ID)
      await contract.connect(minter).awardPoints(student1.address, SURVEY_ID)
      expect(await contract.totalPoints(student1.address)).to.equal(SURVEY_POINTS)
    })

    it('reverts when the wallet has not claimed the survey', async () => {
      await expect(
        contract.connect(admin).revokePoints(student2.address, SURVEY_ID),
      ).to.be.revertedWithCustomError(contract, 'NotClaimed')
    })

    it('rejects non-admin callers', async () => {
      await expect(contract.connect(minter).revokePoints(student1.address, SURVEY_ID)).to.be
        .reverted
      await expect(contract.connect(outsider).revokePoints(student1.address, SURVEY_ID)).to.be
        .reverted
    })
  })

  // -------------------------------------------------------------------
  //  reactivateSurvey (NEW)
  // -------------------------------------------------------------------

  describe('reactivateSurvey', () => {
    beforeEach(async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
    })

    it('flips an inactive survey back to active', async () => {
      await contract.connect(admin).deactivateSurvey(SURVEY_ID)
      await contract.connect(admin).reactivateSurvey(SURVEY_ID)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.active).to.equal(true)
    })

    it('emits SurveyReactivated', async () => {
      await contract.connect(admin).deactivateSurvey(SURVEY_ID)
      await expect(contract.connect(admin).reactivateSurvey(SURVEY_ID))
        .to.emit(contract, 'SurveyReactivated')
        .withArgs(SURVEY_ID)
    })

    it('reverts on already-active survey', async () => {
      await expect(
        contract.connect(admin).reactivateSurvey(SURVEY_ID),
      ).to.be.revertedWithCustomError(contract, 'SurveyAlreadyActive')
    })

    it('reverts on missing survey', async () => {
      await expect(contract.connect(admin).reactivateSurvey(999)).to.be.revertedWithCustomError(
        contract,
        'SurveyNotFound',
      )
    })

    it('rejects non-admin callers', async () => {
      await contract.connect(admin).deactivateSurvey(SURVEY_ID)
      await expect(contract.connect(outsider).reactivateSurvey(SURVEY_ID)).to.be.reverted
    })
  })

  // -------------------------------------------------------------------
  //  Admin-count invariant
  // -------------------------------------------------------------------

  describe('addAdmin / removeAdmin / adminCount', () => {
    it('starts with adminCount == 1 after init', async () => {
      expect(await contract.adminCount()).to.equal(1)
    })

    it('increments adminCount on addAdmin', async () => {
      await contract.connect(admin).addAdmin(admin2.address)
      expect(await contract.adminCount()).to.equal(2)
    })

    it('treats addAdmin as idempotent', async () => {
      await contract.connect(admin).addAdmin(admin2.address)
      await contract.connect(admin).addAdmin(admin2.address)
      expect(await contract.adminCount()).to.equal(2)
    })

    it('decrements adminCount on removeAdmin', async () => {
      await contract.connect(admin).addAdmin(admin2.address)
      await contract.connect(admin).removeAdmin(admin2.address)
      expect(await contract.adminCount()).to.equal(1)
    })

    it('refuses to remove the last admin', async () => {
      await expect(
        contract.connect(admin).removeAdmin(admin.address),
      ).to.be.revertedWithCustomError(contract, 'LastAdmin')
    })

    it('allows removing self when at least one other admin remains', async () => {
      await contract.connect(admin).addAdmin(admin2.address)
      await contract.connect(admin).removeAdmin(admin.address)
      expect(await contract.isAdmin(admin.address)).to.equal(false)
      expect(await contract.adminCount()).to.equal(1)
    })

    it('keeps the count consistent across grantRole / revokeRole entry points', async () => {
      const ADMIN_ROLE = await contract.ADMIN_ROLE()
      await contract.connect(admin).grantRole(ADMIN_ROLE, admin2.address)
      expect(await contract.adminCount()).to.equal(2)
      await contract.connect(admin).revokeRole(ADMIN_ROLE, admin2.address)
      expect(await contract.adminCount()).to.equal(1)
    })
  })

  // -------------------------------------------------------------------
  //  Wallet submission tracking
  // -------------------------------------------------------------------

  describe('wallet submission tracking', () => {
    it('marks and unmarks wallets', async () => {
      await contract.connect(admin).markWalletSubmitted(student1.address)
      expect(await contract.isWalletSubmitted(student1.address)).to.equal(true)

      await contract.connect(admin).unmarkWalletSubmitted(student1.address)
      expect(await contract.isWalletSubmitted(student1.address)).to.equal(false)
    })

    it('reverts on double-mark', async () => {
      await contract.connect(admin).markWalletSubmitted(student1.address)
      await expect(
        contract.connect(admin).markWalletSubmitted(student1.address),
      ).to.be.revertedWithCustomError(contract, 'WalletAlreadySubmitted')
    })

    it('reverts on unmark without prior mark', async () => {
      await expect(
        contract.connect(admin).unmarkWalletSubmitted(student1.address),
      ).to.be.revertedWithCustomError(contract, 'WalletNotSubmitted')
    })
  })

  // -------------------------------------------------------------------
  //  UUPS upgradeability
  // -------------------------------------------------------------------

  describe('UUPS upgrade', () => {
    it('keeps state across an upgrade to the same implementation', async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
      await contract.connect(minter).awardPoints(student1.address, SURVEY_ID)

      const proxyAddress = await contract.getAddress()
      const factory = await ethers.getContractFactory('SurveyPointsV2', admin)
      const upgraded = (await upgrades.upgradeProxy(
        proxyAddress,
        factory,
      )) as unknown as SurveyPointsV2

      expect(await upgraded.getAddress()).to.equal(proxyAddress)
      expect(await upgraded.totalPoints(student1.address)).to.equal(SURVEY_POINTS)
      expect(await upgraded.version()).to.equal('2.0.0')
    })

    it('rejects upgrades initiated by non-DEFAULT_ADMIN_ROLE accounts', async () => {
      const proxyAddress = await contract.getAddress()
      const factory = await ethers.getContractFactory('SurveyPointsV2', outsider)
      await expect(upgrades.upgradeProxy(proxyAddress, factory)).to.be.reverted
    })
  })
})
