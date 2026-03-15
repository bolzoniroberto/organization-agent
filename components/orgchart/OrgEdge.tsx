'use client'
import React from 'react'
import { type EdgeProps, BaseEdge } from '@xyflow/react'

export function OrgEdge({ id, sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  // Bus-bar layout: vertical drop → shared horizontal bus → vertical drop to child
  // Siblings share same sourceY and targetY → midY identical → horizontal segments overlap into single bus
  const midY = (sourceY + targetY) / 2
  const path = `M ${sourceX},${sourceY} L ${sourceX},${midY} L ${targetX},${midY} L ${targetX},${targetY}`
  return <BaseEdge id={id} path={path} style={style} />
}

export const EDGE_TYPES = { orgEdge: OrgEdge }
