export const SURVEY_POINTS_ABI = [
  'function totalPoints(address wallet) external view returns (uint256)',
  'function surveyPoints(address wallet, uint256 surveyId) external view returns (uint8)',
  'function claimed(address wallet, uint256 surveyId) external view returns (bool)',
  'function getSurveyInfo(uint256 surveyId) external view returns (bytes32 secretHash, uint8 points, uint256 maxClaims, uint256 claimCount, bool active, uint256 registeredAt)',
  'event PointsAwarded(address indexed wallet, uint256 indexed surveyId, uint8 points)',
  'event SurveyRegistered(uint256 indexed surveyId, uint8 points, uint256 maxClaims)',
  'event SurveyDeactivated(uint256 indexed surveyId)',
] as const
