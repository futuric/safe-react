import React from 'react'

import OwnerComponent from './OwnerComponent'

export type ownersWithoutConfirmations = {
  hasPendingAcceptActions: boolean
  hasPendingRejectActions: boolean
  owner: string
}[]

type OwnersListProps = {
  executor: string
  isCancelTx?: boolean
  onTxConfirm?: () => void
  onTxExecute?: () => void
  onTxReject?: () => void
  ownersUnconfirmed: ownersWithoutConfirmations
  ownersWhoConfirmed: string[]
  showConfirmBtn?: boolean
  showExecuteBtn?: boolean
  showExecuteRejectBtn?: boolean
  showRejectBtn?: boolean
  thresholdReached: boolean
  userAddress: string
}

const OwnersList = (props: OwnersListProps): React.ReactElement => {
  const { ownersUnconfirmed, ownersWhoConfirmed } = props
  return (
    <>
      {ownersWhoConfirmed.map((owner) => (
        <OwnerComponent confirmed key={owner} owner={owner} {...props} />
      ))}
      {ownersUnconfirmed.map(({ hasPendingAcceptActions, hasPendingRejectActions, owner }) => (
        <OwnerComponent
          key={owner}
          owner={owner}
          pendingAcceptAction={hasPendingAcceptActions}
          pendingRejectAction={hasPendingRejectActions}
          {...props}
        />
      ))}
    </>
  )
}

export default OwnersList
