import { BN, fromWei, toWei } from 'web3-utils'
import ether from './helpers/ether'
import EVMRevert from './helpers/EVMRevert'
import { duration } from './helpers/duration'
import { PairHash } from '../config'


const BigNumber = BN
const timeMachine = require('ganache-time-traveler')

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const ETH_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

const url = "https://gateway.pinata.cloud/ipfs/QmNVZdcfwaadBzKkDFfGXtqNdKwEbMsQY5xZJxfSxNcK2i/1/"
const nftType = ".json"
const NFTPrice = toWei("1")
const initTokenSupply =    toWei(String(10000000))
const quarterTokenSupply = toWei(String(2500000))

// real contracts
const UniswapV2Factory = artifacts.require('./UniswapV2Factory.sol')
const UniswapV2Router = artifacts.require('./UniswapV2Router02.sol')
const UniswapV2Pair = artifacts.require('./UniswapV2Pair.sol')
const WETH = artifacts.require('./WETH9.sol')
const TOKEN = artifacts.require('./Token.sol')
const Stake = artifacts.require('./Stake.sol')
const Sale = artifacts.require('./Sale.sol')
const Fetch = artifacts.require('./Fetch.sol')
const NFT = artifacts.require('./NFT.sol')


let pancakeFactory,
    pancakeRouter,
    weth,
    token,
    pair,
    pancakePairAddress,
    stake,
    fetch,
    sale,
    nft


contract('Fetch-test', function([userOne, userTwo, userThree]) {

  async function deployContracts(){
    // deploy contracts
    weth = await WETH.new()

    pancakeFactory = await UniswapV2Factory.new(userOne)
    pancakeRouter = await UniswapV2Router.new(pancakeFactory.address, weth.address)

    token = await TOKEN.new(initTokenSupply)

    // add token liquidity to Pancake
    await token.approve(pancakeRouter.address, quarterTokenSupply)
    await pancakeRouter.addLiquidityETH(
      token.address,
      quarterTokenSupply,
      1,
      1,
      userOne,
      "1111111111111111111111"
    , { from:userOne, value:toWei(String(500)) })


    pancakePairAddress = await pancakeFactory.allPairs(0)
    pair = await UniswapV2Pair.at(pancakePairAddress)

    nft = await NFT.new(10000, userOne, url, nftType)

    stake = await Stake.new(
      userOne,
      token.address,
      pair.address,
      nft.address,
      duration.days(30),
      100,
      NFTPrice,
      userOne
    )

    sale = await Sale.new(
      token.address,
      userOne,
      pancakeRouter.address
    )

    fetch = await Fetch.new(
      weth.address,
      pancakeRouter.address,
      stake.address,
      token.address,
      pair.address,
      sale.address
    )

    // add some rewards to claim stake
    stake.setRewardsDistribution(userOne)
    token.transfer(stake.address, toWei(String(1)))
    stake.notifyRewardAmount(toWei(String(1)))

    // get some tokens to users
    token.transfer(userTwo, toWei(String(1)))
    token.transfer(userThree, toWei(String(1)))

    // transfer ownership from nft to stake
    await nft.transferOwnership(stake.address)

    // transfer tokens to sale
    await token.transfer(sale.address, quarterTokenSupply)
  }

  beforeEach(async function() {
    await deployContracts()
  })

  describe('INIT', function() {
    it('PairHash correct', async function() {
      assert.equal(
        String(await pancakeFactory.pairCodeHash()).toLowerCase(),
        String(PairHash).toLowerCase(),
      )
    })

    it('Factory in Router correct', async function() {
      assert.equal(
        String(await pancakeRouter.factory()).toLowerCase(),
        String(pancakeFactory.address).toLowerCase(),
      )
    })

    it('WETH in Router correct', async function() {
      assert.equal(
        String(await pancakeRouter.WETH()).toLowerCase(),
        String(weth.address).toLowerCase(),
      )
    })

    it('Correct init token supply', async function() {
      assert.equal(
        await token.totalSupply(),
        initTokenSupply,
      )
    })

    it('Correct init claim Stake', async function() {
      assert.equal(await stake.rewardsToken(), token.address)
      assert.equal(await stake.stakingToken(), pair.address)
    })

    it('token should be added in LD DEX', async function() {
      assert.isTrue(await pair.totalSupply() > 0)
    })
  })


  describe('NFT', function() {
    it('NFT claim NOT works without fetch', async function() {
      await stake.claimNFT(0, { from:userTwo }).should.be.rejectedWith(EVMRevert)
      assert.equal(await nft.balanceOf(userTwo), 0)
    })

    it('NFT claim works after fetch Deposit', async function() {
      assert.equal(await nft.balanceOf(userTwo), 0)
      // deposit
      await fetch.deposit({ from:userTwo, value:toWei(String(1)) })
      // claim
      await stake.claimNFT(0, { from:userTwo })
      assert.equal(await nft.balanceOf(userTwo), 1)
    })

    it('NFT claim works after fetch depositETHAndERC20', async function() {
      assert.equal(await nft.balanceOf(userTwo), 0)
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      await fetch.depositETHAndERC20(toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // claim
      await stake.claimNFT(0, { from:userTwo })
      assert.equal(await nft.balanceOf(userTwo), 1)
    })
  })

  describe('CLAIM ABLE token fetch WITH DEPOSIT WITH token', function() {
    it('Convert input to pool and stake via token fetch and fetch send all shares and remains back to user', async function() {
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stake.address)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stake.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // stake should receive pool
      assert.notEqual(Number(await pair.balanceOf(stake.address)), 0)
      // user should receive token shares
      assert.notEqual(Number(await stake.balanceOf(userTwo)), 0)
    })

    it('User can withdraw converted pool via fetch from vault', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // shares should be equal to pool depsoit
      const staked = await pair.balanceOf(stake.address)
      const shares = await stake.balanceOf(userTwo)
      // staked and shares should be equal
      assert.equal(Number(shares), Number(staked))
      // withdraw
      await stake.withdraw(shares, { from:userTwo })
      // vault should burn shares
      assert.equal(await stake.balanceOf(userTwo), 0)
      // stake send all tokens
      assert.equal(Number(await pair.balanceOf(stake.address)), 0)
      // vault should send user token
      assert.equal(
        Number(await pair.balanceOf(userTwo)),
        Number(staked)
      )
    })

    it('User claim correct rewards and pool amount after exit', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // get staked amount
      const staked = await pair.balanceOf(stake.address)
      // staked should be more than 0
      assert.isTrue(staked > 0)
      // clear user balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      await timeMachine.advanceTimeAndBlock(duration.days(31))
      // estimate rewards
      const estimateReward = await stake.earned(userTwo)
      // get user shares
      const shares = await stake.balanceOf(userTwo)
      // withdraw
      await stake.exit({ from:userTwo })
      // user should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateReward))
      // user get pool
      assert.equal(Number(await pair.balanceOf(userTwo)), staked)
      // stake send all address
      assert.equal(Number(await pair.balanceOf(stake.address)), 0)
    })

    it('Claim rewards calculates correct for a few users after exit ', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)

      // deposit form user 2
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      // deposit form user 3
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userThree })
      // deposit
      await fetch.depositETHAndERC20(toWei(String(0.1)), { from:userThree, value:toWei(String(0.1)) })
      // clear user 3 balance
      await token.transfer(userOne, await token.balanceOf(userThree), {from:userThree})
      assert.equal(await token.balanceOf(userThree), 0)

      // increase time
      await timeMachine.advanceTimeAndBlock(duration.days(31))

      // estimate rewards
      const estimateRewardTwo = await stake.earned(userTwo)
      const estimateRewardThree = await stake.earned(userThree)

      assert.isTrue(estimateRewardTwo > toWei(String(0.49)))
      assert.isTrue(estimateRewardThree > toWei(String(0.49)))

      // withdraw
      await stake.exit({ from:userTwo })
      await stake.exit({ from:userThree })

      // users should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateRewardTwo))
      assert.equal(Number(await token.balanceOf(userThree)), Number(estimateRewardThree))
    })

    it('token fetch can handle big deposit and after this users can continue do many small deposits ', async function() {
      // user 1 not hold any shares
      assert.equal(Number(await stake.balanceOf(userOne)), 0)
      // deposit form user 1
      // approve token
      await token.approve(fetch.address, toWei(String(500)), { from:userOne })
      // deposit
      await fetch.depositETHAndERC20(toWei(String(500)), { from:userOne, value:toWei(String(500)) })
      // user 1 get shares
      assert.notEqual(Number(await stake.balanceOf(userOne)), 0)

      // user 2 not hold any shares
      assert.equal(Number(await stake.balanceOf(userTwo)), 0)
      // deposit form user 2
      // approve token
      await token.approve(fetch.address, toWei(String(0.001)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(toWei(String(0.001)), { from:userTwo, value:toWei(String(0.001)) })
      // user 2 get shares
      assert.notEqual(Number(await stake.balanceOf(userTwo)), 0)
    })

    it('token fetch can handle many deposits ', async function() {
      // approve token
      await token.approve(fetch.address, toWei(String(100)), { from:userOne })

      for(let i=0; i<100;i++){
        const sharesBefore = Number(await stake.balanceOf(userOne))
        await fetch.depositETHAndERC20(toWei(String(0.01)), { from:userOne, value:toWei(String(0.01)) })
        assert.isTrue(
          Number(await stake.balanceOf(userOne)) > sharesBefore
        )
      }
    })
  })

  describe('CLAIM ABLE token fetch DEPOSIT ONLY BNB', function() {
    it('Convert input to pool and stake via token fetch and fetch send all shares and remains back to user', async function() {
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stake.address)), 0)
      // deposit
      await fetch.deposit({ from:userTwo, value:toWei(String(1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stake.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // stake should receive pool
      assert.notEqual(Number(await pair.balanceOf(stake.address)), 0)
      // user should receive token shares
      assert.notEqual(Number(await stake.balanceOf(userTwo)), 0)
    })

    it('Sale send ETH to receiver after user deposit in fetch', async function() {
      const beneficiaryETHBalanceBefore = Number(await web3.eth.getBalance(userOne))
      // deposit
      await fetch.deposit({ from:userTwo, value:toWei(String(1)) })

      // receiver receive ETH
      assert.isTrue(
        Number(await web3.eth.getBalance(userOne))
        >
        beneficiaryETHBalanceBefore
      )
    })

    it('User can withdraw converted pool via fetch from vault', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // deposit
      await fetch.deposit({ from:userTwo, value:toWei(String(1)) })
      // shares should be equal to pool depsoit
      const staked = await pair.balanceOf(stake.address)
      const shares = await stake.balanceOf(userTwo)
      // staked and shares should be equal
      assert.equal(Number(shares), Number(staked))
      // withdraw
      await stake.withdraw(shares, { from:userTwo })
      // vault should burn shares
      assert.equal(await stake.balanceOf(userTwo), 0)
      // stake send all tokens
      assert.equal(Number(await pair.balanceOf(stake.address)), 0)
      // vault should send user token
      assert.equal(
        Number(await pair.balanceOf(userTwo)),
        Number(staked)
      )
    })

    it('User claim correct rewards and pool amount after exit', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // deposit
      await fetch.deposit({ from:userTwo, value:toWei(String(1)) })
      // get staked amount
      const staked = await pair.balanceOf(stake.address)
      // staked should be more than 0
      assert.isTrue(staked > 0)
      // clear user balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      await timeMachine.advanceTimeAndBlock(duration.days(31))
      // estimate rewards
      const estimateReward = await stake.earned(userTwo)
      // get user shares
      const shares = await stake.balanceOf(userTwo)
      // withdraw
      await stake.exit({ from:userTwo })
      // user should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateReward))
      // user get pool
      assert.equal(Number(await pair.balanceOf(userTwo)), staked)
      // stake send all address
      assert.equal(Number(await pair.balanceOf(stake.address)), 0)
    })

    it('Claim rewards calculates correct for a few users after exit ', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)

      // deposit form user 2
      await fetch.deposit({ from:userTwo, value:toWei(String(1)) })
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      // deposit form user 3
      await fetch.deposit({ from:userThree, value:toWei(String(1)) })
      // clear user 3 balance
      await token.transfer(userOne, await token.balanceOf(userThree), {from:userThree})
      assert.equal(await token.balanceOf(userThree), 0)

      // increase time
      await timeMachine.advanceTimeAndBlock(duration.days(31))

      // estimate rewards
      const estimateRewardTwo = await stake.earned(userTwo)
      const estimateRewardThree = await stake.earned(userThree)

      // check rewards
      assert.isTrue(estimateRewardTwo > toWei(String(0.5)))
      assert.isTrue(estimateRewardThree > toWei(String(0.49)))

      // withdraw
      await stake.exit({ from:userTwo })
      await stake.exit({ from:userThree })

      // users should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateRewardTwo))
      assert.equal(Number(await token.balanceOf(userThree)), Number(estimateRewardThree))
    })

    it('token fetch can handle big deposit and after this users can continue do many small deposits ', async function() {
      // user 1 not hold any shares
      assert.equal(Number(await stake.balanceOf(userOne)), 0)
      // deposit form user 1
      await fetch.deposit({ from:userOne, value:toWei(String(500)) })
      // user 1 get shares
      assert.notEqual(Number(await stake.balanceOf(userOne)), 0)

      // user 2 not hold any shares
      assert.equal(Number(await stake.balanceOf(userTwo)), 0)
      // deposit form user 2
      await fetch.deposit({ from:userTwo, value:toWei(String(0.001)) })
      // user 2 get shares
      assert.notEqual(Number(await stake.balanceOf(userTwo)), 0)
    })

    it('token fetch can handle many deposits ', async function() {
      for(let i=0; i<100;i++){
        const sharesBefore = Number(await stake.balanceOf(userOne))
        await fetch.deposit({ from:userOne, value:toWei(String(0.01)) })
        assert.isTrue(
          Number(await stake.balanceOf(userOne)) > sharesBefore
        )
      }
    })
  })
  //END
})
