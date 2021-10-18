pragma solidity ^0.6.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IUniswapV2Router02.sol";


contract Sale is Ownable {
  using SafeMath for uint256;
  address payable public beneficiary;
  IERC20  public token;
  bool public paused = false;
  IUniswapV2Router02 public Router;
  bool public sellEnd = false;

  event Buy(address indexed user, uint256 amount);

  /**
  * @dev constructor
  *
  * @param _token         token address
  * @param _beneficiary   Address for receive ETH
  * @param _router        Uniswap v2 router
  */
  constructor(
    address _token,
    address payable _beneficiary,
    address _router
    )
    public
  {
    token = IERC20(_token);
    beneficiary = _beneficiary;
    Router = IUniswapV2Router02(_router);
  }

  /**
  * @dev user can buy MoreBTC via ETH
  *
  */
  function buy() public payable {
    require(!sellEnd, "Sale end");
    // not allow buy if paused
    require(!paused, "Paused");
    // not allow buy 0
    require(msg.value > 0, "Zerro input");
    // calculate amount of morebtc to send
    uint256 sendAmount = getSalePrice(msg.value);
    // check token balance
    require(token.balanceOf(address(this)) >= sendAmount, "Not enough tokens for sale");
    // transfer ETH from user to receiver
    beneficiary.transfer(msg.value);
    // transfer mbtc to user
    token.transfer(msg.sender, sendAmount);
    // event
    emit Buy(msg.sender, sendAmount);
  }

  /**
  * @dev return sale price from pool
  */
  function getSalePrice(uint256 _amount) public view returns(uint256) {
    address[] memory path = new address[](2);
    path[0] = Router.WETH();
    path[1] = address(token);
    uint256[] memory res = Router.getAmountsOut(_amount, path);
    return res[1];
  }

  /**
  * @dev called by the owner to pause, triggers stopped state
  */
  function pause() onlyOwner external {
    paused = true;
  }

  /**
  * @dev called by the owner to unpause, returns to normal state
  */
  function unpause() onlyOwner external {
    paused = false;
  }

  /**
   * @dev fallback function
   */
  receive() external payable  {
    buy();
  }
}
