import CollectionMain from './components/CollectionMain';
import CollectionSidebar from './components/CollectionSidebar';

const Collection = () => {
  return (
    <div className="w-full h-full flex ">
      <CollectionSidebar />
      <CollectionMain />
    </div>
  );
};

export default Collection;
