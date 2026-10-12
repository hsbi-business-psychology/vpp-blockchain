import { expect } from 'chai'
import { ethers, upgrades } from 'hardhat'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import type { SurveyPointsV2, SurveyPointsV3 } from '../typechain-types'

/**
 * SurveyPointsV3 — fractional points (centipoints, 1 point = 100).
 *
 * Every test starts from a V2 proxy that already holds data, then upgrades
 * it through the OpenZeppelin Upgrades plugin. That mirrors the production
 * path and lets the plugin validate storage-layout compatibility in CI.
 */
describe('SurveyPointsV3', () => {
  let contract: SurveyPointsV3
  let admin: HardhatEthersSigner
  let minter: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let outsider: HardhatEthersSigner

  beforeEach(async () => {
    ;[admin, minter, alice, bob, outsider] = await ethers.getSigners()

    const v2Factory = await ethers.getContractFactory('SurveyPointsV2')
    const proxy = await upgrades.deployProxy(v2Factory, [admin.address, minter.address], {
      kind: 'uups',
      initializer: 'initialize',
    })
    await proxy.waitForDeployment()
    const v2 = proxy as unknown as SurveyPointsV2

    // V2-era data that must survive the upgrade untouched.
    await v2.connect(admin).registerSurvey(1, 2, 0, 'V2 survey')
    await v2.connect(admin).registerSurvey(2, 1, 0, 'Ärger & Übermut')
    await v2.connect(minter).awardPoints(alice.address, 1)
    await v2.connect(minter).awardPoints(alice.address, 2)
    await v2.connect(minter).awardPoints(bob.address, 1)
    await v2.connect(admin).markWalletSubmitted(bob.address)

    const v3Factory = await ethers.getContractFactory('SurveyPointsV3', admin)
    const upgraded = await upgrades.upgradeProxy(await proxy.getAddress(), v3Factory)
    await upgraded.waitForDeployment()
    contract = upgraded as unknown as SurveyPointsV3
  })

  describe('Upgrade from V2', () => {
    it('reports version 3.0.0', async () => {
      expect(await contract.version()).to.equal('3.0.0')
    })

    it('keeps all V2 balances, claims, surveys and roles', async () => {
      expect(await contract.totalPoints(alice.address)).to.equal(3)
      expect(await contract.totalPoints(bob.address)).to.equal(2)
      expect(await contract.totalPointsCenti(alice.address)).to.equal(300)
      expect(await contract.surveyPoints(alice.address, 1)).to.equal(2)
      expect(await contract.surveyPointsCenti(alice.address, 2)).to.equal(100)
      expect(await contract.claimed(bob.address, 1)).to.equal(true)
      expect(await contract.isWalletSubmitted(bob.address)).to.equal(true)
      expect(await contract.isAdmin(admin.address)).to.equal(true)
      expect(await contract.adminCount()).to.equal(1)

      const info = await contract.getSurveyInfo(2)
      expect(info.points).to.equal(1)
      expect(info.claimCount).to.equal(1)
      expect(info.title).to.equal('Ärger & Übermut')
      expect((await contract.getSurveyInfoCenti(1)).centiPoints).to.equal(200)
    })

    it('can revoke a claim made before the upgrade', async () => {
      await contract.connect(admin).revokePoints(alice.address, 1)
      expect(await contract.totalPoints(alice.address)).to.equal(1)
      expect(await contract.surveyPoints(alice.address, 1)).to.equal(0)
      expect((await contract.getSurveyInfo(1)).claimCount).to.equal(1)
    })
  })

  describe('Fractional surveys', () => {
    it('registers, awards and reports a 0.25-point survey', async () => {
      await expect(contract.connect(admin).registerSurveyCenti(10, 25, 2, 'Quarter'))
        .to.emit(contract, 'SurveyRegisteredCenti')
        .withArgs(10, 25, 2, 'Quarter')

      const info = await contract.getSurveyInfoCenti(10)
      expect(info.centiPoints).to.equal(25)
      expect(info.maxClaims).to.equal(2)
      expect(info.active).to.equal(true)
      // Legacy view rounds down (documented).
      expect((await contract.getSurveyInfo(10)).points).to.equal(0)

      await expect(contract.connect(minter).awardPoints(alice.address, 10))
        .to.emit(contract, 'PointsAwardedCenti')
        .withArgs(alice.address, 10, 25)

      expect(await contract.totalPointsCenti(alice.address)).to.equal(325)
      expect(await contract.totalPoints(alice.address)).to.equal(3)
      expect(await contract.surveyPointsCenti(alice.address, 10)).to.equal(25)
      expect(await contract.claimed(alice.address, 10)).to.equal(true)
    })

    it('adds 0.25 + 0.5 + 0.75 + 1.5 up to exactly 3 points', async () => {
      const values = [25, 50, 75, 150]
      for (const [i, centi] of values.entries()) {
        await contract.connect(admin).registerSurveyCenti(11 + i, centi, 0, `S${i}`)
        await contract.connect(minter).awardPoints(outsider.address, 11 + i)
      }
      expect(await contract.totalPointsCenti(outsider.address)).to.equal(300)
      expect(await contract.totalPoints(outsider.address)).to.equal(3)
    })

    it('enforces one claim per wallet and maxClaims', async () => {
      await contract.connect(admin).registerSurveyCenti(10, 50, 2, 'Half')
      await contract.connect(minter).awardPoints(alice.address, 10)
      await expect(contract.connect(minter).awardPoints(alice.address, 10))
        .to.be.revertedWithCustomError(contract, 'AlreadyClaimed')
        .withArgs(alice.address, 10)
      await contract.connect(minter).awardPoints(bob.address, 10)
      await expect(contract.connect(minter).awardPoints(outsider.address, 10))
        .to.be.revertedWithCustomError(contract, 'MaxClaimsReached')
        .withArgs(10)
    })

    it('deactivates and reactivates a fractional survey', async () => {
      await contract.connect(admin).registerSurveyCenti(10, 50, 0, 'Half')
      await contract.connect(admin).deactivateSurvey(10)
      await expect(contract.connect(minter).awardPoints(alice.address, 10))
        .to.be.revertedWithCustomError(contract, 'SurveyNotActive')
        .withArgs(10)
      await contract.connect(admin).reactivateSurvey(10)
      await contract.connect(minter).awardPoints(alice.address, 10)
      expect(await contract.totalPointsCenti(alice.address)).to.equal(350)
    })

    it('revokes a fractional claim and allows re-claiming', async () => {
      await contract.connect(admin).registerSurveyCenti(10, 75, 0, 'Three quarters')
      await contract.connect(minter).awardPoints(alice.address, 10)

      await expect(contract.connect(admin).revokePoints(alice.address, 10))
        .to.emit(contract, 'PointsRevokedCenti')
        .withArgs(alice.address, 10, 75, admin.address)

      expect(await contract.totalPointsCenti(alice.address)).to.equal(300)
      expect(await contract.surveyPointsCenti(alice.address, 10)).to.equal(0)
      expect(await contract.claimed(alice.address, 10)).to.equal(false)
      expect((await contract.getSurveyInfoCenti(10)).claimCount).to.equal(0)

      await contract.connect(minter).awardPoints(alice.address, 10)
      expect(await contract.totalPointsCenti(alice.address)).to.equal(375)
    })
  })

  describe('Whole values keep the V2 behaviour', () => {
    it('stores a multiple of 100 as a whole-point survey with V2 events', async () => {
      await expect(contract.connect(admin).registerSurveyCenti(20, 300, 0, 'Three'))
        .to.emit(contract, 'SurveyRegistered')
        .withArgs(20, 3, 0, 'Three')
      expect((await contract.getSurveyInfo(20)).points).to.equal(3)

      await expect(contract.connect(minter).awardPoints(bob.address, 20))
        .to.emit(contract, 'PointsAwarded')
        .withArgs(bob.address, 20, 3)
      expect(await contract.totalPoints(bob.address)).to.equal(5)
    })

    it('still accepts the V2 registerSurvey function', async () => {
      await contract.connect(admin).registerSurvey(21, 4, 0, 'Legacy')
      expect((await contract.getSurveyInfoCenti(21)).centiPoints).to.equal(400)
    })
  })

  describe('Validation and access control', () => {
    it('rejects 0, values above 255 points, and survey id 0', async () => {
      await expect(
        contract.connect(admin).registerSurveyCenti(30, 0, 0, 'x'),
      ).to.be.revertedWithCustomError(contract, 'InvalidPoints')
      await expect(
        contract.connect(admin).registerSurveyCenti(30, 25_501, 0, 'x'),
      ).to.be.revertedWithCustomError(contract, 'InvalidPoints')
      await expect(
        contract.connect(admin).registerSurveyCenti(0, 25, 0, 'x'),
      ).to.be.revertedWithCustomError(contract, 'InvalidSurveyId')
      await contract.connect(admin).registerSurveyCenti(31, 25_500, 0, 'max')
    })

    it('rejects ids already used by either kind of survey', async () => {
      await expect(contract.connect(admin).registerSurveyCenti(1, 25, 0, 'dup'))
        .to.be.revertedWithCustomError(contract, 'SurveyAlreadyExists')
        .withArgs(1)
      await contract.connect(admin).registerSurveyCenti(32, 25, 0, 'frac')
      await expect(contract.connect(admin).registerSurvey(32, 1, 0, 'dup'))
        .to.be.revertedWithCustomError(contract, 'SurveyAlreadyExists')
        .withArgs(32)
    })

    it('restricts registration to admins and awarding to the minter', async () => {
      await expect(contract.connect(outsider).registerSurveyCenti(40, 25, 0, 'x')).to.be.reverted
      await contract.connect(admin).registerSurveyCenti(40, 25, 0, 'x')
      await expect(contract.connect(admin).awardPoints(alice.address, 40)).to.be.reverted
      await contract.connect(minter).awardPoints(alice.address, 40)
      await expect(contract.connect(minter).revokePoints(alice.address, 40)).to.be.reverted
    })

    it('reports unknown surveys as centiPoints 0 and reverts on award', async () => {
      expect((await contract.getSurveyInfoCenti(99)).centiPoints).to.equal(0)
      await expect(contract.connect(minter).awardPoints(alice.address, 99))
        .to.be.revertedWithCustomError(contract, 'SurveyNotFound')
        .withArgs(99)
    })
  })
})
