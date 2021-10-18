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

// real contracts
const UniswapV2Factory = artifacts.require('./UniswapV2Factory.sol')
const UniswapV2Router = artifacts.require('./UniswapV2Router02.sol')
const UniswapV2Pair = artifacts.require('./UniswapV2Pair.sol')
const WETH = artifacts.require('./WETH9.sol')
const TOKEN = artifacts.require('./Token.sol')
const Stake = artifacts.require('./Stake.sol')
const Fetch = artifacts.require('./Fetch.sol')
const Sale = artifacts.require('./Sale.sol')
const NFT = artifacts.require('./NFT.sol')

const url = "https://gateway.pinata.cloud/ipfs/QmNVZdcfwaadBzKkDFfGXtqNdKwEbMsQY5xZJxfSxNcK2i/1/"
const nftType = ".json"
const NFTPrice = toWei("1")
const initTokenSupply =    toWei(String(1000))
const quarterTokenSupply = toWei(String(250))


let uniswapV2Factory,
    uniswapV2Router,
    weth,
    token,
    pair,
    pairAddress,
    stake,
    fetch,
    sale,
    nft


contract('Sale-test', function([userOne, userTwo, userThree]) {

  async function deployContracts(){
    // deploy contracts
    uniswapV2Factory = await UniswapV2Factory.new(userOne)
    weth = await WETH.new()
    uniswapV2Router = await UniswapV2Router.new(uniswapV2Factory.address, weth.address)
    token = await TOKEN.new(initTokenSupply)

    // add token liquidity
    await token.approve(uniswapV2Router.address, quarterTokenSupply)

    await uniswapV2Router.addLiquidityETH(
      token.address,
      quarterTokenSupply,
      1,
      1,
      userOne,
      "1111111111111111111111"
    , { from:userOne, value:toWei(String(500)) })

    pairAddress = await uniswapV2Factory.allPairs(0)
    pair = await UniswapV2Pair.at(pairAddress)

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
      uniswapV2Router.address
    )

    fetch = await Fetch.new(
      weth.address,
      uniswapV2Router.address,
      stake.address,
      token.address,
      pair.address,
      sale.address
    )

    // add some rewards to claim stake
    stake.setRewardsDistribution(userOne)
    token.transfer(stake.address, toWei(String(1)))
    stake.notifyRewardAmount(toWei(String(1)))
    // transfer tokens to sale
    await token.transfer(sale.address, quarterTokenSupply)
  }

  beforeEach(async function() {
    await deployContracts()
  })

  describe('INIT Sale', function() {
    it('Correct init token sale', async function() {
      assert.equal(await sale.token(), token.address)
      assert.equal(await sale.beneficiary(), userOne)
      assert.equal(await sale.Router(), uniswapV2Router.address)
    })
  })

  describe('token sale', function() {
    it('Not Owner can NOT pause and unpause sale ', async function() {
      await sale.pause({ from:userTwo })
      .should.be.rejectedWith(EVMRevert)

      await sale.unpause({ from:userTwo })
      .should.be.rejectedWith(EVMRevert)
    })

    it('Owner can pause and unpause sale ', async function() {
      await sale.pause()
      await sale.buy({ from:userTwo, value:toWei(String(1)) })
      .should.be.rejectedWith(EVMRevert)

      await sale.unpause()
      const tokenBalanceBefore = await token.balanceOf(userTwo)
      await sale.buy({ from:userTwo, value:toWei(String(1)) })
      assert.isTrue(
        await token.balanceOf(userTwo) > tokenBalanceBefore
      )
    })


    it('Beneficiary receive ETH', async function() {
      const beneficiaryETHBalanceBefore = Number(await web3.eth.getBalance(userOne))

      await sale.sendTransaction({
        value: toWei(String(1)),
        from:userTwo
      })

      assert.isTrue(
        Number(await web3.eth.getBalance(userOne))
        >
        beneficiaryETHBalanceBefore
      )
    })

    it('User can buy from sale, just send ETH', async function() {
      const tokenBalanceBefore = await token.balanceOf(userTwo)

      await sale.sendTransaction({
        value: toWei(String(1)),
        from:userTwo
      })

      assert.isTrue(
        await token.balanceOf(userTwo) > tokenBalanceBefore
      )
    })

    it('User can buy from sale, via call function buy', async function() {
      const tokenBalanceBefore = await token.balanceOf(userTwo)

      await sale.buy({ from:userTwo, value:toWei(String(1)) })

      assert.isTrue(
        await token.balanceOf(userTwo) > tokenBalanceBefore
      )
    })

    it('Sale rate should be same as in DEX ', async function() {
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), { from:userTwo })
      assert.equal(await token.balanceOf(userTwo), 0)
      const saleRate = await sale.getSalePrice(toWei(String(1)))

      await uniswapV2Router.swapExactETHForTokens(
        1,
        [weth.address, token.address],
        userTwo,
        "1111111111111111111111",
        { from:userTwo, value:toWei(String(1)) }
      )

      assert.equal(
        Number(saleRate),
        Number(await token.balanceOf(userTwo))
      )
    })

    it('Sale rate should be still same as in DEX after update LD', async function() {
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), { from:userTwo })
      assert.equal(await token.balanceOf(userTwo), 0)

      // ADD LD
      const totalLDBefore = await pair.totalSupply()
      await token.approve(uniswapV2Router.address, toWei(String(10)))
      await uniswapV2Router.addLiquidityETH(
        token.address,
        toWei(String(10)),
        1,
        1,
        userOne,
        "1111111111111111111111"
      , { from:userOne, value:toWei(String(10)) })
      // should be add new LD
      assert.isTrue(Number(await pair.totalSupply()) > Number(totalLDBefore))

      const saleRate = await sale.getSalePrice(toWei(String(1)))

      await uniswapV2Router.swapExactETHForTokens(
        1,
        [weth.address, token.address],
        userTwo,
        "1111111111111111111111",
        { from:userTwo, value:toWei(String(1)) }
      )

      assert.equal(
        Number(saleRate),
        Number(await token.balanceOf(userTwo))
      )
    })
  })
  //END
})
