import { expect } from 'chai'
import { ethers } from 'hardhat'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import type { SurveyPoints } from '../typechain-types'

describe('SurveyPoints', () => {
  let contract: SurveyPoints
  let admin: HardhatEthersSigner
  let minter: HardhatEthersSigner
  let student1: HardhatEthersSigner
  let student2: HardhatEthersSigner
  let outsider: HardhatEthersSigner

  const SURVEY_ID = 1
  const SURVEY_SECRET = 'VPP-test-secret-42'
  const SURVEY_POINTS = 2
  const MAX_CLAIMS = 100
  const SURVEY_TITLE = 'Test Survey Alpha'

  let secretHash: string

  beforeEach(async () => {
    ;[admin, minter, student1, student2, outsider] = await ethers.getSigners()

    secretHash = ethers.keccak256(ethers.toUtf8Bytes(SURVEY_SECRET))

    const factory = await ethers.getContractFactory('SurveyPoints')
    contract = await factory.deploy(admin.address, minter.address)
    await contract.waitForDeployment()
  })

  // -------------------------------------------------------------------
  //  Deployment & Roles
  // -------------------------------------------------------------------

  describe('Deployment', () => {
    it('should assign DEFAULT_ADMIN_ROLE to admin', async () => {
      const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE()
      expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true
    })

    it('should assign ADMIN_ROLE to admin', async () => {
      const ADMIN_ROLE = await contract.ADMIN_ROLE()
      expect(await contract.hasRole(ADMIN_ROLE, admin.address)).to.be.true
    })

    it('should assign MINTER_ROLE to minter', async () => {
      const MINTER_ROLE = await contract.MINTER_ROLE()
      expect(await contract.hasRole(MINTER_ROLE, minter.address)).to.be.true
    })

    it('should revert when admin address is zero', async () => {
      const factory = await ethers.getContractFactory('SurveyPoints')
      await expect(
        factory.deploy(ethers.ZeroAddress, minter.address),
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress')
    })

    it('should revert when minter address is zero', async () => {
      const factory = await ethers.getContractFactory('SurveyPoints')
      await expect(
        factory.deploy(admin.address, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress')
    })
  })

  // -------------------------------------------------------------------
  //  Survey Registration
  // -------------------------------------------------------------------

  describe('registerSurvey', () => {
    it('should register a survey with correct parameters', async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.secretHash).to.equal(secretHash)
      expect(info.points).to.equal(SURVEY_POINTS)
      expect(info.maxClaims).to.equal(MAX_CLAIMS)
      expect(info.claimCount).to.equal(0)
      expect(info.active).to.be.true
      expect(info.registeredAt).to.be.greaterThan(0)
      expect(info.title).to.equal(SURVEY_TITLE)
    })

    it('should store and return the survey title', async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.title).to.equal(SURVEY_TITLE)
    })

    it('should emit SurveyRegistered event', async () => {
      await expect(
        contract
          .connect(admin)
          .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE),
      )
        .to.emit(contract, 'SurveyRegistered')
        .withArgs(SURVEY_ID, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
    })

    it('should allow registering a survey with unlimited claims (maxClaims = 0)', async () => {
      await contract.connect(admin).registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, 0, SURVEY_TITLE)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.maxClaims).to.equal(0)
    })

    it('should revert when surveyId is 0', async () => {
      await expect(
        contract.connect(admin).registerSurvey(0, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE),
      ).to.be.revertedWithCustomError(contract, 'InvalidSurveyId')
    })

    it('should revert when points is 0', async () => {
      await expect(
        contract.connect(admin).registerSurvey(SURVEY_ID, secretHash, 0, MAX_CLAIMS, SURVEY_TITLE),
      ).to.be.revertedWithCustomError(contract, 'InvalidPoints')
    })

    it('should revert when survey already exists', async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)

      await expect(
        contract
          .connect(admin)
          .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE),
      ).to.be.revertedWithCustomError(contract, 'SurveyAlreadyExists')
    })

    it('should revert when called by non-admin', async () => {
      await expect(
        contract
          .connect(outsider)
          .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE),
      ).to.be.reverted
    })

    it('should allow registering multiple surveys', async () => {
      await contract
        .connect(admin)
        .registerSurvey(1, secretHash, 2, MAX_CLAIMS, 'Survey One')
      await contract
        .connect(admin)
        .registerSurvey(2, secretHash, 3, MAX_CLAIMS, 'Survey Two')

      const info1 = await contract.getSurveyInfo(1)
      const info2 = await contract.getSurveyInfo(2)
      expect(info1.points).to.equal(2)
      expect(info2.points).to.equal(3)
    })
  })

  // -------------------------------------------------------------------
  //  Award Points
  // -------------------------------------------------------------------

  describe('awardPoints', () => {
    beforeEach(async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
    })

    it('should award points to a student', async () => {
      await contract
        .connect(minter)
        .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET)

      expect(await contract.totalPoints(student1.address)).to.equal(SURVEY_POINTS)
      expect(await contract.surveyPoints(student1.address, SURVEY_ID)).to.equal(SURVEY_POINTS)
      expect(await contract.claimed(student1.address, SURVEY_ID)).to.be.true
    })

    it('should emit PointsAwarded event', async () => {
      await expect(
        contract
          .connect(minter)
          .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET),
      )
        .to.emit(contract, 'PointsAwarded')
        .withArgs(student1.address, SURVEY_ID, SURVEY_POINTS)
    })

    it('should increment claim count', async () => {
      await contract
        .connect(minter)
        .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.claimCount).to.equal(1)
    })

    it('should accumulate total points across surveys', async () => {
      const secret2 = 'VPP-second-secret'
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes(secret2))
      await contract.connect(admin).registerSurvey(2, hash2, 3, MAX_CLAIMS, 'Second Survey')

      await contract
        .connect(minter)
        .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET)
      await contract.connect(minter).awardPoints(student1.address, 2, secret2)

      expect(await contract.totalPoints(student1.address)).to.equal(SURVEY_POINTS + 3)
    })

    it('should allow different students to claim the same survey', async () => {
      await contract
        .connect(minter)
        .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET)
      await contract
        .connect(minter)
        .awardPoints(student2.address, SURVEY_ID, SURVEY_SECRET)

      expect(await contract.totalPoints(student1.address)).to.equal(SURVEY_POINTS)
      expect(await contract.totalPoints(student2.address)).to.equal(SURVEY_POINTS)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.claimCount).to.equal(2)
    })

    it('should revert on double claim', async () => {
      await contract
        .connect(minter)
        .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET)

      await expect(
        contract
          .connect(minter)
          .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET),
      ).to.be.revertedWithCustomError(contract, 'AlreadyClaimed')
    })

    it('should revert with invalid secret', async () => {
      await expect(
        contract
          .connect(minter)
          .awardPoints(student1.address, SURVEY_ID, 'wrong-secret'),
      ).to.be.revertedWithCustomError(contract, 'InvalidSecret')
    })

    it('should revert when survey does not exist', async () => {
      await expect(
        contract
          .connect(minter)
          .awardPoints(student1.address, 999, SURVEY_SECRET),
      ).to.be.revertedWithCustomError(contract, 'SurveyNotFound')
    })

    it('should revert when survey is inactive', async () => {
      await contract.connect(admin).deactivateSurvey(SURVEY_ID)

      await expect(
        contract
          .connect(minter)
          .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET),
      ).to.be.revertedWithCustomError(contract, 'SurveyNotActive')
    })

    it('should revert when called by non-minter', async () => {
      await expect(
        contract
          .connect(outsider)
          .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET),
      ).to.be.reverted
    })

    it('should revert when student address is zero', async () => {
      await expect(
        contract
          .connect(minter)
          .awardPoints(ethers.ZeroAddress, SURVEY_ID, SURVEY_SECRET),
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress')
    })
  })

  // -------------------------------------------------------------------
  //  Max Claims
  // -------------------------------------------------------------------

  describe('Max claims enforcement', () => {
    const LIMITED_MAX = 2

    beforeEach(async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, LIMITED_MAX, SURVEY_TITLE)
    })

    it('should allow claims up to the limit', async () => {
      await contract
        .connect(minter)
        .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET)
      await contract
        .connect(minter)
        .awardPoints(student2.address, SURVEY_ID, SURVEY_SECRET)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.claimCount).to.equal(LIMITED_MAX)
    })

    it('should revert when max claims is reached', async () => {
      await contract
        .connect(minter)
        .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET)
      await contract
        .connect(minter)
        .awardPoints(student2.address, SURVEY_ID, SURVEY_SECRET)

      const signers = await ethers.getSigners()
      await expect(
        contract
          .connect(minter)
          .awardPoints(signers[5].address, SURVEY_ID, SURVEY_SECRET),
      ).to.be.revertedWithCustomError(contract, 'MaxClaimsReached')
    })

    it('should allow unlimited claims when maxClaims is 0', async () => {
      await contract
        .connect(admin)
        .registerSurvey(2, secretHash, SURVEY_POINTS, 0, 'Unlimited Survey')

      const signers = await ethers.getSigners()
      for (let i = 0; i < 5; i++) {
        await contract
          .connect(minter)
          .awardPoints(signers[i + 5].address, 2, SURVEY_SECRET)
      }

      const info = await contract.getSurveyInfo(2)
      expect(info.claimCount).to.equal(5)
    })
  })

  // -------------------------------------------------------------------
  //  Survey Deactivation
  // -------------------------------------------------------------------

  describe('deactivateSurvey', () => {
    beforeEach(async () => {
      await contract
        .connect(admin)
        .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
    })

    it('should deactivate a survey', async () => {
      await contract.connect(admin).deactivateSurvey(SURVEY_ID)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.active).to.be.false
    })

    it('should emit SurveyDeactivated event', async () => {
      await expect(contract.connect(admin).deactivateSurvey(SURVEY_ID))
        .to.emit(contract, 'SurveyDeactivated')
        .withArgs(SURVEY_ID)
    })

    it('should prevent new claims on deactivated survey', async () => {
      await contract.connect(admin).deactivateSurvey(SURVEY_ID)

      await expect(
        contract
          .connect(minter)
          .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET),
      ).to.be.revertedWithCustomError(contract, 'SurveyNotActive')
    })

    it('should revert when survey does not exist', async () => {
      await expect(
        contract.connect(admin).deactivateSurvey(999),
      ).to.be.revertedWithCustomError(contract, 'SurveyNotFound')
    })

    it('should revert when survey is already inactive', async () => {
      await contract.connect(admin).deactivateSurvey(SURVEY_ID)

      await expect(
        contract.connect(admin).deactivateSurvey(SURVEY_ID),
      ).to.be.revertedWithCustomError(contract, 'SurveyNotActive')
    })

    it('should revert when called by non-admin', async () => {
      await expect(
        contract.connect(outsider).deactivateSurvey(SURVEY_ID),
      ).to.be.reverted
    })

    it('should preserve existing claims after deactivation', async () => {
      await contract
        .connect(minter)
        .awardPoints(student1.address, SURVEY_ID, SURVEY_SECRET)

      await contract.connect(admin).deactivateSurvey(SURVEY_ID)

      expect(await contract.totalPoints(student1.address)).to.equal(SURVEY_POINTS)
      expect(await contract.claimed(student1.address, SURVEY_ID)).to.be.true
    })
  })

  // -------------------------------------------------------------------
  //  Read Functions
  // -------------------------------------------------------------------

  describe('Read functions', () => {
    it('should return 0 total points for a wallet with no claims', async () => {
      expect(await contract.totalPoints(student1.address)).to.equal(0)
    })

    it('should return 0 survey points for an unclaimed survey', async () => {
      expect(await contract.surveyPoints(student1.address, SURVEY_ID)).to.equal(0)
    })

    it('should return false for unclaimed survey', async () => {
      expect(await contract.claimed(student1.address, SURVEY_ID)).to.be.false
    })

    it('should return empty info for non-existent survey', async () => {
      const info = await contract.getSurveyInfo(999)
      expect(info.points).to.equal(0)
      expect(info.active).to.be.false
    })
  })

  // -------------------------------------------------------------------
  //  Role Management
  // -------------------------------------------------------------------

  describe('Role management', () => {
    it('should allow admin to grant ADMIN_ROLE to another address', async () => {
      const ADMIN_ROLE = await contract.ADMIN_ROLE()
      await contract.connect(admin).grantRole(ADMIN_ROLE, outsider.address)
      expect(await contract.hasRole(ADMIN_ROLE, outsider.address)).to.be.true
    })

    it('should allow admin to grant MINTER_ROLE to another address', async () => {
      const MINTER_ROLE = await contract.MINTER_ROLE()
      await contract.connect(admin).grantRole(MINTER_ROLE, outsider.address)
      expect(await contract.hasRole(MINTER_ROLE, outsider.address)).to.be.true
    })

    it('should allow new admin to register surveys', async () => {
      const ADMIN_ROLE = await contract.ADMIN_ROLE()
      await contract.connect(admin).grantRole(ADMIN_ROLE, outsider.address)

      await contract
        .connect(outsider)
        .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)

      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.points).to.equal(SURVEY_POINTS)
    })

    it('should not allow non-admin to grant roles', async () => {
      const ADMIN_ROLE = await contract.ADMIN_ROLE()
      await expect(
        contract.connect(outsider).grantRole(ADMIN_ROLE, student1.address),
      ).to.be.reverted
    })
  })

  // -------------------------------------------------------------------
  //  Convenience admin functions
  // -------------------------------------------------------------------

  describe('isAdmin / addAdmin / removeAdmin', () => {
    it('isAdmin returns true for admin', async () => {
      expect(await contract.isAdmin(admin.address)).to.be.true
    })

    it('isAdmin returns false for non-admin', async () => {
      expect(await contract.isAdmin(outsider.address)).to.be.false
    })

    it('addAdmin grants ADMIN_ROLE', async () => {
      await contract.connect(admin).addAdmin(outsider.address)
      expect(await contract.isAdmin(outsider.address)).to.be.true
    })

    it('new admin added via addAdmin can register surveys', async () => {
      await contract.connect(admin).addAdmin(outsider.address)
      await contract
        .connect(outsider)
        .registerSurvey(SURVEY_ID, secretHash, SURVEY_POINTS, MAX_CLAIMS, SURVEY_TITLE)
      const info = await contract.getSurveyInfo(SURVEY_ID)
      expect(info.points).to.equal(SURVEY_POINTS)
    })

    it('new admin can add another admin', async () => {
      await contract.connect(admin).addAdmin(outsider.address)
      await contract.connect(outsider).addAdmin(student1.address)
      expect(await contract.isAdmin(student1.address)).to.be.true
    })

    it('removeAdmin revokes ADMIN_ROLE', async () => {
      await contract.connect(admin).addAdmin(outsider.address)
      expect(await contract.isAdmin(outsider.address)).to.be.true

      await contract.connect(admin).removeAdmin(outsider.address)
      expect(await contract.isAdmin(outsider.address)).to.be.false
    })

    it('non-admin cannot call addAdmin', async () => {
      await expect(
        contract.connect(outsider).addAdmin(student1.address),
      ).to.be.reverted
    })

    it('non-admin cannot call removeAdmin', async () => {
      await expect(
        contract.connect(outsider).removeAdmin(admin.address),
      ).to.be.reverted
    })

    it('addAdmin reverts for zero address', async () => {
      await expect(
        contract.connect(admin).addAdmin(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress')
    })

    it('removeAdmin reverts for zero address', async () => {
      await expect(
        contract.connect(admin).removeAdmin(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress')
    })
  })
})
