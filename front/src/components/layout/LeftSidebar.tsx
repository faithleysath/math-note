import React from 'react';
import TreeView from '../TreeView';

const LeftSidebar = () => {
  return (
    <div className="h-full p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Navigation</h2>
        {/* Add button can go here */}
      </div>
      <TreeView />
    </div>
  );
};

export default LeftSidebar;
