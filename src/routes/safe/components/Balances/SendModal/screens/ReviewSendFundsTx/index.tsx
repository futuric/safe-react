import IconButton from '@material-ui/core/IconButton'
import { makeStyles } from '@material-ui/core/styles'
import Close from '@material-ui/icons/Close'
import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { ExplorerButton, Button } from '@gnosis.pm/safe-react-components'

import { toTokenUnit } from 'src/logic/tokens/utils/humanReadableValue'
import { getExplorerInfo, getNetworkInfo } from 'src/config'
import CopyBtn from 'src/components/CopyBtn'
import Identicon from 'src/components/Identicon'
import Block from 'src/components/layout/Block'
import Col from 'src/components/layout/Col'
import Hairline from 'src/components/layout/Hairline'
import Img from 'src/components/layout/Img'
import Paragraph from 'src/components/layout/Paragraph'
import Row from 'src/components/layout/Row'
import { getSpendingLimitContract } from 'src/logic/contracts/safeContracts'
import createTransaction from 'src/logic/safe/store/actions/createTransaction'
import { safeParamAddressFromStateSelector } from 'src/logic/safe/store/selectors'
import { TX_NOTIFICATION_TYPES } from 'src/logic/safe/transactions'
import { getHumanFriendlyToken } from 'src/logic/tokens/store/actions/fetchTokens'
import { sameAddress, ZERO_ADDRESS } from 'src/logic/wallets/ethAddresses'
import { EMPTY_DATA } from 'src/logic/wallets/ethTransactions'
import SafeInfo from 'src/routes/safe/components/Balances/SendModal/SafeInfo'
import { setImageToPlaceholder } from 'src/routes/safe/components/Balances/utils'
import { extendedSafeTokensSelector } from 'src/routes/safe/container/selector'
import { SpendingLimit } from 'src/logic/safe/store/models/safe'
import { sm } from 'src/theme/variables'
import { sameString } from 'src/utils/strings'
import { TokenProps } from 'src/logic/tokens/store/model/token'
import { RecordOf } from 'immutable'
import { useEstimateTransactionGas } from 'src/logic/hooks/useEstimateTransactionGas'
import { TransactionFees } from 'src/components/TransactionsFees'

import ArrowDown from '../assets/arrow-down.svg'
import { styles } from './style'
import { EditableTxParameters } from '../../../../Transactions/helpers/EditableTxParameters'
import { TxParametersDetail } from 'src/routes/safe/components/Transactions/helpers/TxParametersDetail'
import { TxParameters } from 'src/routes/safe/container/hooks/useTransactionParameters'

const useStyles = makeStyles(styles)

const { nativeCoin } = getNetworkInfo()

export type ReviewTxProp = {
  recipientAddress: string
  amount: string
  txRecipient: string
  token: string
  txType?: string
  tokenSpendingLimit?: SpendingLimit
}

type ReviewTxProps = {
  onClose: () => void
  onPrev: () => void
  tx: ReviewTxProp
}

const useTxAmount = (tx: ReviewTxProp, isSendingNativeToken: boolean, txToken?: RecordOf<TokenProps>): string => {
  const [txAmount, setTxAmount] = useState('0')

  // txAmount should be 0 if we send tokens
  // the real value is encoded in txData and will be used by the contract
  // if txAmount > 0 it would send ETH from the Safe (and the data will be empty)
  useEffect(() => {
    const txAmount = isSendingNativeToken ? toTokenUnit(tx.amount, nativeCoin.decimals) : '0'
    setTxAmount(txAmount)
  }, [tx.amount, txToken, isSendingNativeToken])

  return txAmount
}

const useTxData = (
  isSendingNativeToken: boolean,
  txAmount: string,
  recipientAddress: string,
  txToken?: RecordOf<TokenProps>,
): string => {
  const [data, setData] = useState('')

  useEffect(() => {
    const updateTxDataAsync = async () => {
      if (!txToken) {
        return
      }

      let txData = EMPTY_DATA
      if (!isSendingNativeToken) {
        const StandardToken = await getHumanFriendlyToken()
        const tokenInstance = await StandardToken.at(txToken.address as string)
        txData = tokenInstance.contract.methods.transfer(recipientAddress, txAmount).encodeABI()
      }
      setData(txData)
    }

    updateTxDataAsync()
  }, [isSendingNativeToken, recipientAddress, txAmount, txToken])

  return data
}

const ReviewSendFundsTx = ({ onClose, onPrev, tx }: ReviewTxProps): React.ReactElement => {
  const classes = useStyles()
  const dispatch = useDispatch()
  const safeAddress = useSelector(safeParamAddressFromStateSelector)
  const tokens: any = useSelector(extendedSafeTokensSelector)
  const txToken = useMemo(() => tokens.find((token) => sameAddress(token.address, tx.token)), [tokens, tx.token])
  const isSendingNativeToken = useMemo(() => sameAddress(txToken?.address, nativeCoin.address), [txToken])
  const txRecipient = isSendingNativeToken ? tx.recipientAddress : txToken?.address || ''

  const txAmount = useTxAmount(tx, isSendingNativeToken, txToken)
  const data = useTxData(isSendingNativeToken, txAmount, tx.recipientAddress, txToken)

  /* Get GasInfo */
  const {
    gasCostFormatted,
    gasPriceFormatted,
    gasLimit,
    txEstimationExecutionStatus,
    isExecution,
    isCreation,
    isOffChainSignature,
  } = useEstimateTransactionGas({
    txData: data,
    txRecipient,
  })

  const submitTx = async (txParameters: TxParameters) => {
    const isSpendingLimit = sameString(tx.txType, 'spendingLimit')

    if (!safeAddress) {
      console.error('There was an error trying to submit the transaction, the safeAddress was not found')
      return
    }

    if (isSpendingLimit && txToken && tx.tokenSpendingLimit) {
      const spendingLimitTokenAddress = isSendingNativeToken ? ZERO_ADDRESS : txToken.address
      const spendingLimit = getSpendingLimitContract()
      spendingLimit.methods
        .executeAllowanceTransfer(
          safeAddress,
          spendingLimitTokenAddress,
          tx.recipientAddress,
          toTokenUnit(tx.amount, txToken.decimals),
          ZERO_ADDRESS,
          0,
          tx.tokenSpendingLimit.delegate,
          EMPTY_DATA,
        )
        .send({ from: tx.tokenSpendingLimit.delegate })
        .on('transactionHash', () => onClose())
        .catch(console.error)
    } else {
      dispatch(
        createTransaction({
          safeAddress: safeAddress,
          to: txRecipient as string,
          valueInWei: txAmount,
          txData: data,
          txNonce: txParameters.safeNonce,
          safeTxGas: txParameters.safeTxGas ? Number(txParameters.safeTxGas) : undefined,
          notifiedTransaction: TX_NOTIFICATION_TYPES.STANDARD_TX,
          ethParameters: txParameters,
        }),
      )
      onClose()
    }
  }

  return (
    <EditableTxParameters ethGasLimit={gasLimit} ethGasPrice={gasPriceFormatted}>
      {(txParameters, toggleEditMode) => (
        <>
          {/* Header */}
          <Row align="center" className={classes.heading} grow data-testid="send-funds-review-step">
            <Paragraph className={classes.headingText} noMargin weight="bolder">
              Send Funds
            </Paragraph>
            <Paragraph className={classes.annotation}>2 of 2</Paragraph>
            <IconButton disableRipple onClick={onClose}>
              <Close className={classes.closeIcon} />
            </IconButton>
          </Row>

          <Hairline />

          <Block className={classes.container}>
            {/* SafeInfo */}
            <SafeInfo />
            <Row margin="md">
              <Col xs={1}>
                <img alt="Arrow Down" src={ArrowDown} style={{ marginLeft: sm }} />
              </Col>
              <Col center="xs" layout="column" xs={11}>
                <Hairline />
              </Col>
            </Row>

            {/* Recipient */}
            <Row margin="xs">
              <Paragraph color="disabled" noMargin size="md" style={{ letterSpacing: '-0.5px' }}>
                Recipient
              </Paragraph>
            </Row>
            <Row align="center" margin="md">
              <Col xs={1}>
                <Identicon address={tx.recipientAddress} diameter={32} />
              </Col>
              <Col layout="column" xs={11}>
                <Block justify="left">
                  <Paragraph
                    className={classes.address}
                    noMargin
                    weight="bolder"
                    data-testid="recipient-address-review-step"
                  >
                    {tx.recipientAddress}
                  </Paragraph>
                  <CopyBtn content={tx.recipientAddress} />
                  <ExplorerButton explorerUrl={getExplorerInfo(tx.recipientAddress)} />
                </Block>
              </Col>
            </Row>

            {/* Amount */}
            <Row margin="xs">
              <Paragraph color="disabled" noMargin size="md" style={{ letterSpacing: '-0.5px' }}>
                Amount
              </Paragraph>
            </Row>
            <Row align="center" margin="md">
              <Img alt={txToken?.name as string} height={28} onError={setImageToPlaceholder} src={txToken?.logoUri} />
              <Paragraph
                className={classes.amount}
                noMargin
                size="md"
                data-testid={`amount-${txToken?.symbol as string}-review-step`}
              >
                {tx.amount} {txToken?.symbol}
              </Paragraph>
            </Row>

            {/* Tx Parameters */}
            <TxParametersDetail txParameters={txParameters} onEdit={toggleEditMode} />

            {/* Disclaimer */}
            <Row>
              <TransactionFees
                gasCostFormatted={gasCostFormatted}
                isExecution={isExecution}
                isCreation={isCreation}
                isOffChainSignature={isOffChainSignature}
                txEstimationExecutionStatus={txEstimationExecutionStatus}
              />
            </Row>
          </Block>

          <Hairline style={{ position: 'absolute', bottom: 85 }} />

          {/* Footer */}
          <Row align="center" className={classes.buttonRow}>
            <Button size="md" color="primary" variant="outlined" onClick={onPrev}>
              Back
            </Button>
            <Button
              size="md"
              className={classes.submitButton}
              color="primary"
              data-testid="submit-tx-btn"
              disabled={!data}
              onClick={() => submitTx(txParameters)}
              variant="contained"
            >
              Submit
            </Button>
          </Row>
        </>
      )}
    </EditableTxParameters>
  )
}

export default ReviewSendFundsTx
