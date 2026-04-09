'use client'
import React from 'react'
import { type EdgeProps, BaseEdge, getSmoothStepPath, Position } from '@xyflow/react'

export function OrgEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, targetPosition, style } = props

  // Hanging layout: tracciamo una 'L' per formare un asse verticale centrale (trunk) unico per tutti i fratelli
  if (targetPosition === Position.Left || targetPosition === Position.Right) {
    const path = `M ${sourceX},${sourceY} L ${sourceX},${targetY} L ${targetX},${targetY}`
    return <BaseEdge id={id} path={path} style={style} />
  }

  // Bus-bar layout: vertical drop → shared horizontal bus → vertical drop to child
  // Siblings share same sourceY and targetY → midY identical → horizontal segments overlap into single bus
  const midY = (sourceY + targetY) / 2
  const path = `M ${sourceX},${sourceY} L ${sourceX},${midY} L ${targetX},${midY} L ${targetX},${targetY}`
  return <BaseEdge id={id} path={path} style={style} />
}

export const EDGE_TYPES = { orgEdge: OrgEdge }
