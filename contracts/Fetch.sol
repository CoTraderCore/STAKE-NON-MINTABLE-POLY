pragma solidity ^0.6.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/ISale.sol";
import "./interfaces/IStake.sol";
import "./interfaces/ISale.sol";


contract Fetch is Ownable {

  using SafeERC20 for IERC20;
  using SafeMath for uint256;
  address public WETH;
  address public dexRouter;

  address public stake;

  address public token;
  address public uniPair;

  uint256 public dexSplit = 50;
  uint256 public saleSplit = 50;

  ISale public sale;

  /**
  * @dev constructor
  *
  * @param _stake                 address of claim able stake
  * @param _token                 address of underlying token
  * @param _uniPair               address of pool pair
  */
  constructor(
    address _WETH,
    address _dexRouter,
    address _stake,
    address _token,
    address _uniPair,
    address _sale
    )
    public
  {
    WETH = _WETH;
    dexRouter = _dexRouter;
    stake = _stake;
    token = _token;
    uniPair = _uniPair;
    sale = ISale(_sale);
  }

  // deposit only ETH
  function deposit() external payable {
    require(msg.value > 0, "zerro eth");
    // swap ETH
    swapETHInput(msg.value);
    // deposit and stake
    _depositFor(msg.sender);
  }

  // deposit only ETH for a certain address
  function depositFor(address receiver) external payable {
    require(msg.value > 0, "zerro eth");
    // swap ETH
    swapETHInput(msg.value);
    // deposit and stake
    _depositFor(receiver);
  }

  // deposit ETH and token without convert
  function depositETHAndERC20(uint256 tokenAmount) external payable {
    IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
    // deposit and stake
    _depositFor(msg.sender);
  }

  /**
  * @dev convert deposited ETH into pool and then stake
  */
  function _depositFor(address receiver) internal {
    // define stake address
    address stakeAddress = stake;

    // check if token received
    uint256 tokenReceived = IERC20(token).balanceOf(address(this));
    uint256 ethBalance = address(this).balance;

    require(tokenReceived > 0, "NOT SWAPED");
    require(ethBalance > 0, "ETH NOT REMAINS");

    // convert ETH to WETH
    IWETH(WETH).deposit.value(ethBalance)();

    // approve tokens to router
    IERC20(token).approve(dexRouter, tokenReceived);
    IERC20(WETH).approve(dexRouter, ethBalance);

    // add LD
    IUniswapV2Router02(dexRouter).addLiquidity(
        WETH,
        token,
        ethBalance,
        tokenReceived,
        1,
        1,
        address(this),
        now + 1800
    );

    // check pool received
    uint256 poolReceived = IERC20(uniPair).balanceOf(address(this));
    require(poolReceived > 0, "ZERRO POOL OUTPUT");

    // approve pool to stake
    IERC20(uniPair).approve(stakeAddress, poolReceived);

    // deposit received pool in token vault strategy
    IStake(stakeAddress).stakeFor(poolReceived, receiver);

    // send remains and shares back to users
    sendRemains(receiver);
  }

  /**
  * @dev swap ETH to token via DEX and Sale
  */
  function swapETHInput(uint256 input) internal {
    // determining the portion of the incoming ETH to be converted to the ERC20 Token
    uint256 conversionPortion = input.mul(505).div(1000);

    (uint256 ethToDex,
     uint256 ethToSale) = calculateToSplit(conversionPortion);

    // SPLIT SALE with DEX and SALE
    if(ethToDex > 0)
      swapETHViaDEX(dexRouter, ethToDex);

    if(ethToSale > 0)
      sale.buy.value(ethToSale)();
  }


 /**
 * @dev send remains back to user
 */
 function sendRemains(address receiver) internal {
    uint256 tokenRemains = IERC20(token).balanceOf(address(this));
    if(tokenRemains > 0)
       IERC20(token).transfer(receiver, tokenRemains);

    uint256 wethRemains = IERC20(WETH).balanceOf(address(this));
    if(wethRemains > 0)
      IERC20(WETH).transfer(receiver, wethRemains);

    uint256 ethRemains = address(this).balance;
    if(ethRemains > 0)
       payable(receiver).transfer(ethRemains);
 }

 // helper for swap via dex
 function swapETHViaDEX(address routerDEX, uint256 amount) internal {
   // SWAP split % of ETH input to token from pool
   address[] memory path = new address[](2);
   path[0] = WETH;
   path[1] = token;

   IUniswapV2Router02(routerDEX).swapExactETHForTokens.value(amount)(
     1,
     path,
     address(this),
     now + 1800
   );
 }

 /**
 * @dev return split % amount of input
 */
 function calculateToSplit(uint256 ethInput)
   public
   view
   returns(uint256 ethToDex, uint256 ethToSale)
 {
   ethToDex = ethInput.div(100).mul(dexSplit);
   ethToSale = ethInput.div(100).mul(saleSplit);
 }

 /**
 * @dev allow owner set new split
 */
 function updateSplit(
   uint256 _dexSplit,
   uint256 _saleSplit
 )
   external
   onlyOwner
 {
   uint256 totalPercentage = _dexSplit + _saleSplit;
   require(totalPercentage == 100, "wrong total split");

   dexSplit = _dexSplit;
   saleSplit = _saleSplit;
 }
}
