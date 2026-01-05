/**
 * User Store Migration Test Script
 * Run this in browser console to test migration
 */

// Test 1: Verify migration from old keys
function testMigration() {
  console.log('🧪 Testing User Store Migration...\n');
  
  // Clear existing user-store
  localStorage.removeItem('user-store');
  
  // Create old keys with test data
  const oldQuranStore = {
    selectedReciterId: 1,
    bookmarks: [{ chapterId: 1, verseNumber: 1, timestamp: Date.now() }],
    lastReadPositions: { 1: 5 },
    playerStates: {},
    scrollPositions: { 1: 100 },
    version: '1.0.0'
  };
  
  localStorage.setItem('quran-store', JSON.stringify(oldQuranStore));
  localStorage.setItem('app_time_format', '12h');
  localStorage.setItem('quran-translation-language', 'bengali');
  localStorage.setItem('prayer_scheduled_notifications', JSON.stringify([
    { prayerKey: 'fajr', prayerName: 'Fajr', scheduledTime: Date.now() + 86400000 }
  ]));
  
  console.log('✅ Created old keys with test data');
  console.log('   - quran-store:', localStorage.getItem('quran-store') ? '✅' : '❌');
  console.log('   - app_time_format:', localStorage.getItem('app_time_format') ? '✅' : '❌');
  console.log('   - quran-translation-language:', localStorage.getItem('quran-translation-language') ? '✅' : '❌');
  console.log('   - prayer_scheduled_notifications:', localStorage.getItem('prayer_scheduled_notifications') ? '✅' : '❌');
  
  // Reload page to trigger migration
  console.log('\n🔄 Reload page to trigger migration...');
  console.log('   After reload, check:');
  console.log('   1. user-store exists');
  console.log('   2. Old keys are removed');
  console.log('   3. Data is migrated correctly');
}

// Test 2: Verify user-store structure
function verifyUserStore() {
  console.log('\n🧪 Verifying User Store Structure...\n');
  
  const userStore = localStorage.getItem('user-store');
  if (!userStore) {
    console.log('❌ user-store does not exist');
    return;
  }
  
  try {
    const data = JSON.parse(userStore);
    console.log('✅ user-store exists');
    console.log('   Structure:', {
      hasSelectedReciterId: 'selectedReciterId' in data,
      hasBookmarks: 'bookmarks' in data,
      hasTimeFormat: 'timeFormat' in data,
      hasQuranTranslationLanguage: 'quranTranslationLanguage' in data,
      hasPrayerScheduledNotifications: 'prayerScheduledNotifications' in data,
      version: data.version
    });
    
    // Verify old keys are removed
    console.log('\n🧹 Verifying old keys are removed...');
    const oldKeys = [
      'quran-store',
      'app_time_format',
      'quran-translation-language',
      'prayer_scheduled_notifications'
    ];
    
    oldKeys.forEach(key => {
      const exists = localStorage.getItem(key);
      console.log(`   ${key}: ${exists ? '❌ Still exists!' : '✅ Removed'}`);
    });
    
  } catch (e) {
    console.error('❌ Error parsing user-store:', e);
  }
}

// Test 3: Test offline functionality
function testOfflineMode() {
  console.log('\n🧪 Testing Offline Mode Compatibility...\n');
  
  // Check if localStorage is available (it should be even offline)
  if (typeof localStorage === 'undefined') {
    console.log('❌ localStorage is not available');
    return;
  }
  
  console.log('✅ localStorage is available (works offline)');
  
  // Verify user-store can be read offline
  const userStore = localStorage.getItem('user-store');
  if (userStore) {
    console.log('✅ user-store can be read offline');
    try {
      const data = JSON.parse(userStore);
      console.log('✅ user-store data is valid JSON');
      console.log('   Data size:', JSON.stringify(data).length, 'bytes');
    } catch (e) {
      console.error('❌ user-store data is corrupted:', e);
    }
  } else {
    console.log('⚠️  user-store does not exist (will be created on first use)');
  }
}

// Test 4: Verify service worker compatibility
function testServiceWorkerCompatibility() {
  console.log('\n🧪 Testing Service Worker Compatibility...\n');
  
  if ('serviceWorker' in navigator) {
    console.log('✅ Service Worker API is available');
    
    navigator.serviceWorker.getRegistrations().then(registrations => {
      if (registrations.length > 0) {
        console.log(`✅ Service Worker is registered (${registrations.length} registration(s))`);
        console.log('   Note: Service workers run in separate context');
        console.log('   They use Cache API, not localStorage directly');
      } else {
        console.log('⚠️  No service worker registered');
      }
    });
  } else {
    console.log('⚠️  Service Worker API not available');
  }
}

// Test 5: Performance test
function testPerformance() {
  console.log('\n🧪 Testing Performance...\n');
  
  const iterations = 100;
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    const data = localStorage.getItem('user-store');
    if (data) {
      JSON.parse(data);
    }
  }
  
  const end = performance.now();
  const avgTime = (end - start) / iterations;
  
  console.log(`✅ Performance test (${iterations} iterations):`);
  console.log(`   Average read + parse time: ${avgTime.toFixed(3)}ms`);
  console.log(`   Total time: ${(end - start).toFixed(3)}ms`);
  
  if (avgTime < 1) {
    console.log('✅ Performance is good (< 1ms per operation)');
  } else {
    console.log('⚠️  Performance could be improved');
  }
}

// Run all tests
function runAllTests() {
  console.log('🚀 Starting User Store Migration Tests\n');
  console.log('='.repeat(50));
  
  verifyUserStore();
  testOfflineMode();
  testServiceWorkerCompatibility();
  testPerformance();
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ All tests completed!');
  console.log('\nTo test migration, run: testMigration()');
}

// Export for use
if (typeof window !== 'undefined') {
  window.testUserStoreMigration = testMigration;
  window.verifyUserStore = verifyUserStore;
  window.testOfflineMode = testOfflineMode;
  window.testServiceWorkerCompatibility = testServiceWorkerCompatibility;
  window.testPerformance = testPerformance;
  window.runAllTests = runAllTests;
  
  console.log('📋 Test functions loaded!');
  console.log('   Available functions:');
  console.log('   - testMigration() - Test migration from old keys');
  console.log('   - verifyUserStore() - Verify user-store structure');
  console.log('   - testOfflineMode() - Test offline compatibility');
  console.log('   - testServiceWorkerCompatibility() - Test SW compatibility');
  console.log('   - testPerformance() - Test performance');
  console.log('   - runAllTests() - Run all tests');
  console.log('\n   Run: runAllTests() to start');
}

