import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DepartmentReferenceValue,
  DirectoryEntry,
  UserReferenceValue,
} from 'openxiangda-contracts/browser';
import {
  directoryEntryFromStored,
  directoryStoredValueFromEntries,
} from '../src/browser/components/platform-fields/directory-value';

test('preserves complete user snapshots through directory selection', () => {
  const user: UserReferenceValue = {
    value: 'user-1',
    label: '张老师',
    avatarUrl: 'https://cdn.example/avatar.png',
    employeeNo: 'T001',
    mobile: '13800000000',
    email: 'teacher@example.test',
    departments: [{
      value: 'department-1',
      label: '理学院',
      fullPath: '学校 / 理学院',
    }],
  };
  const entry = directoryEntryFromStored('user', user);
  assert.equal(entry.description, 'T001 · 理学院');
  assert.equal(directoryStoredValueFromEntries([entry], false), user);
});

test('preserves department path and parent snapshots without resolving again', () => {
  const department: DepartmentReferenceValue = {
    value: 'department-2',
    label: '实验中心',
    fullPath: '学校 / 理学院 / 实验中心',
    path: [
      { value: 'root', label: '学校' },
      { value: 'department-1', label: '理学院' },
      { value: 'department-2', label: '实验中心' },
    ],
    parent: { value: 'department-1', label: '理学院' },
  };
  const entry = directoryEntryFromStored('department', department);
  assert.equal(entry.parentId, 'department-1');
  assert.deepEqual(entry.path?.map(item => item.id), [
    'root',
    'department-1',
    'department-2',
  ]);
  assert.deepEqual(
    directoryStoredValueFromEntries([entry, entry] as DirectoryEntry[], true),
    [department, department]
  );
});
