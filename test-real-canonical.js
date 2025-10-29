const mongoose = require('mongoose');
const Comic = require('./models/comic.model.js');

async function testRealCanonicalMetadata() {
  try {
    await mongoose.connect('mongodb://localhost:27017/threetwo');
    console.log('🔍 Testing canonical metadata with real comics from database...\n');
    
    // Find a recently imported comic
    const comic = await Comic.findOne({}).sort({createdAt: -1}).limit(1);
    
    if (!comic) {
      console.log('❌ No comics found in database');
      return;
    }
    
    console.log('📚 Found comic:', comic.inferredMetadata?.name || 'Unknown');
    console.log('📅 Created:', comic.createdAt);
    console.log('');
    
    // Check if canonical metadata exists
    if (comic.canonicalMetadata) {
      console.log('✅ Canonical metadata structure exists!');
      console.log('📊 Completeness score:', comic.canonicalMetadata.completenessScore);
      console.log('📝 Has user modifications:', comic.canonicalMetadata.hasUserModifications);
      console.log('');
      
      // Show some sample canonical fields
      if (comic.canonicalMetadata.title) {
        console.log('🏷️  Title:', comic.canonicalMetadata.title.value);
        console.log('   Source:', comic.canonicalMetadata.title.source);
        console.log('   User selected:', comic.canonicalMetadata.title.userSelected);
      }
      
      if (comic.canonicalMetadata.publisher) {
        console.log('🏢 Publisher:', comic.canonicalMetadata.publisher.value);
        console.log('   Source:', comic.canonicalMetadata.publisher.source);
      }
      
      if (comic.canonicalMetadata.series && comic.canonicalMetadata.series.name) {
        console.log('📖 Series:', comic.canonicalMetadata.series.name.value);
        console.log('   Source:', comic.canonicalMetadata.series.name.source);
      }
      
      console.log('');
      console.log('🎯 Canonical metadata system is working with real comics!');
    } else {
      console.log('❌ No canonical metadata found');
      console.log('📋 Available fields:', Object.keys(comic.toObject()));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testRealCanonicalMetadata();